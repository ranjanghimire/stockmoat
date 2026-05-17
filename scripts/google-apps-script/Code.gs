/**
 * StockMoat — MoatSync pipeline (Google Sheets + Gemini + Vercel API)
 *
 * Setup: see scripts/google-apps-script/README.md
 * Tabs required: "Config" (prompts in B1:B3), "MoatSync" (data from row 2, columns A–F; F = company name from DB for disambiguation)
 */

var SHEET_SYNC = 'MoatSync'
var SHEET_CONFIG = 'Config'
var MIN_DAYS_BETWEEN_RUNS = 55
/** Manual menu “generate” / full pipeline: cap rows per click. Scheduled runs use no cap (time budget only). */
var MAX_ROWS_GENERATE = 30
var MAX_ROWS_PUSH = 40
/** Scheduled push per run (ready_to_sync rows). */
var SCHEDULED_MAX_ROWS_PUSH = 120
var PROP_CYCLE_IN_PROGRESS = 'MOAT_CYCLE_IN_PROGRESS'
var PROP_CYCLE_COMPLETED = 'LAST_MOAT_PIPELINE_RUN'
/** Pause between back-to-back Gemini calls (rate limit / quota). Override with script property GEMINI_SLEEP_MS (0–5000). */
var GEMINI_SLEEP_MS = 400
/** Stop generating before Google’s ~6 min hard limit so the run can exit cleanly. Override with GEMINI_GENERATION_BUDGET_MS (60000–330000). */
var GENERATION_BUDGET_MS = 270000

function notify_(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg)
  } catch (e) {
    Logger.log(msg)
  }
}

function getProps_() {
  return PropertiesService.getScriptProperties()
}

function getApiBase_() {
  var base = getProps_().getProperty('MOAT_PIPELINE_API')
  if (!base) throw new Error('Set Script property MOAT_PIPELINE_API (e.g. https://stockmoat.vercel.app)')
  return base.replace(/\/$/, '')
}

function getPass_() {
  var p = getProps_().getProperty('MOAT_ADMIN_PASSPHRASE')
  if (!p) throw new Error('Set Script property MOAT_ADMIN_PASSPHRASE')
  return p
}

function getGeminiKey_() {
  var k = getProps_().getProperty('GEMINI_API_KEY')
  if (!k) throw new Error('Set Script property GEMINI_API_KEY')
  return k
}

function getGeminiModel_() {
  return getProps_().getProperty('GEMINI_MODEL') || 'gemini-2.5-flash'
}

function getGeminiSleepMs_() {
  var raw = getProps_().getProperty('GEMINI_SLEEP_MS')
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    var n = parseInt(String(raw), 10)
    if (!isNaN(n) && n >= 0 && n <= 5000) return n
  }
  return GEMINI_SLEEP_MS
}

function getGenerationBudgetMs_() {
  var raw = getProps_().getProperty('GEMINI_GENERATION_BUDGET_MS')
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    var n = parseInt(String(raw), 10)
    if (!isNaN(n) && n >= 60000 && n <= 330000) return n
  }
  return GENERATION_BUDGET_MS
}

function apiPost_(payload) {
  var url = getApiBase_() + '/api/moat-sheet-pipeline'
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify(payload),
  })
  var code = res.getResponseCode()
  var text = res.getContentText()
  var json = {}
  try {
    json = JSON.parse(text)
  } catch (e) {
    json = { error: text }
  }
  return { code: code, json: json }
}

/** Run once after deploy — verifies UrlFetch to Vercel + Gemini works. */
function authorizeTestCall() {
  var pass = getPass_()
  var r = apiPost_({ passphrase: pass, action: 'tickers' })
  if (r.code !== 200 || !r.json.tickers) {
    throw new Error('Tickers API failed: ' + r.code + ' ' + JSON.stringify(r.json))
  }
  var key = getGeminiKey_()
  var model = getGeminiModel_()
  var gUrl =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    model +
    ':generateContent?key=' +
    encodeURIComponent(key)
  var gRes = UrlFetchApp.fetch(gUrl, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 32 },
    }),
  })
  if (gRes.getResponseCode() !== 200) {
    throw new Error('Gemini test failed: ' + gRes.getResponseCode() + ' ' + gRes.getContentText())
  }
  SpreadsheetApp.getUi().alert('OK — Vercel tickers + Gemini both work.')
}

function getSyncSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sh = ss.getSheetByName(SHEET_SYNC)
  if (!sh) throw new Error('Missing sheet tab: ' + SHEET_SYNC)
  return sh
}

function getConfigSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sh = ss.getSheetByName(SHEET_CONFIG)
  if (!sh) throw new Error('Missing sheet tab: ' + SHEET_CONFIG)
  return sh
}

function loadPrompts_() {
  var c = getConfigSheet_()
  var moat = (c.getRange('B1').getValue() || '').toString().trim()
  var how = (c.getRange('B2').getValue() || '').toString().trim()
  var deals = (c.getRange('B3').getValue() || '').toString().trim()
  if (!moat || !how || !deals) {
    throw new Error('Config!B1:B3 must all contain prompt templates (use {{TICKER}}; add {{COMPANY_NAME}} when column F is filled).')
  }
  return { moat: moat, how: how, deals: deals }
}

function substitute_(template, ticker, companyName) {
  var t = template.split('{{TICKER}}').join(ticker)
  var c = companyName ? String(companyName) : ''
  return t.split('{{COMPANY_NAME}}').join(c)
}

/** True when output looks cut off (no sentence end, or API hit token cap). */
function looksIncompleteParagraph_(text) {
  var s = String(text || '').trim()
  if (s.length < 50) return true
  return !/[.!?]["']?\s*$/.test(s)
}

function geminiGenerationConfig_(maxOutputTokens) {
  var cfg = {
    temperature: 0.35,
    maxOutputTokens: maxOutputTokens,
  }
  var model = getGeminiModel_()
  // 2.5 models spend “thinking” tokens inside maxOutputTokens → short/empty answers unless disabled.
  if (model.indexOf('2.5') >= 0) {
    cfg.thinkingConfig = { thinkingBudget: 0 }
  }
  return cfg
}

function extractGeminiText_(body) {
  var cand = ((body || {}).candidates || [])[0]
  if (!cand) return { text: '', finishReason: '' }
  var pts = (cand.content || {}).parts || []
  var buf = []
  for (var i = 0; i < pts.length; i++) {
    if (pts[i].thought === true) continue
    if (pts[i].text) buf.push(String(pts[i].text))
  }
  if (buf.length === 0) {
    for (var j = 0; j < pts.length; j++) {
      if (pts[j].text) buf.push(String(pts[j].text))
    }
  }
  return {
    text: buf.join('').replace(/\r\n/g, '\n').trim(),
    finishReason: String(cand.finishReason || ''),
  }
}

function callGemini_(userPrompt) {
  var key = getGeminiKey_()
  var model = getGeminiModel_()
  var url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    model +
    ':generateContent?key=' +
    encodeURIComponent(key)
  var limits = [2048, 4096]
  var lastErr = ''
  for (var attempt = 0; attempt < limits.length; attempt++) {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: geminiGenerationConfig_(limits[attempt]),
      }),
    })
    if (res.getResponseCode() !== 200) {
      throw new Error('Gemini HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 500))
    }
    var parsed = extractGeminiText_(JSON.parse(res.getContentText()))
    if (!parsed.text) {
      lastErr = 'Empty Gemini response'
      continue
    }
    if (parsed.finishReason === 'MAX_TOKENS' || looksIncompleteParagraph_(parsed.text)) {
      lastErr = 'Incomplete Gemini response (' + (parsed.finishReason || 'no sentence end') + ')'
      continue
    }
    return parsed.text
  }
  throw new Error(lastErr || 'Gemini failed')
}

function rowNeedsGenerate_(ticker, moat, how, deals, status) {
  if (!ticker) return false
  var st = String(status || '')
  if (st.indexOf('gemini_error') >= 0) return true
  var b = String(moat || '').trim()
  var c = String(how || '').trim()
  var d = String(deals || '').trim()
  if (!b || !c || !d) return true
  if (looksIncompleteParagraph_(b) || looksIncompleteParagraph_(c) || looksIncompleteParagraph_(d)) return true
  return false
}

function pullTickersFromDb(silent) {
  if (silent === undefined) silent = false
  var pass = getPass_()
  var r = apiPost_({ passphrase: pass, action: 'tickers' })
  if (r.code !== 200 || !r.json.tickers) {
    throw new Error('tickers failed: ' + r.code + ' ' + JSON.stringify(r.json))
  }
  var list = r.json.tickers
  var entries = Array.isArray(r.json.entries)
    ? r.json.entries
    : list.map(function (s) {
        return { symbol: s, displayName: null }
      })
  var sh = getSyncSheet_()
  var h1 = (sh.getRange(1, 6).getValue() || '').toString().trim()
  if (!h1) {
    sh.getRange(1, 6).setValue('Company (DB)')
  }
  var last = sh.getLastRow()
  if (last >= 2) {
    // numRows = last - 1 so we clear rows 2 … last (not last+1 extra blank row)
    sh.getRange(2, 1, last - 1, 6).clearContent()
  }
  if (list.length === 0) return
  var nameBySymbol = {}
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i]
    if (e && e.symbol) {
      nameBySymbol[String(e.symbol).toUpperCase()] = e.displayName ? String(e.displayName) : ''
    }
  }
  var out = []
  for (var j = 0; j < list.length; j++) {
    var sym = String(list[j]).toUpperCase()
    var dn = nameBySymbol[sym] || ''
    // A=ticker, B–D left blank for Gemini, E status, F=display name from screen_scores when present
    out.push([sym, '', '', '', '', dn])
  }
  // getRange(row, column, numRows, numColumns) — 3rd arg is ROW COUNT, not last row index
  sh.getRange(2, 1, out.length, 6).setValues(out)
  var msg = 'Pulled ' + list.length + ' tickers into ' + SHEET_SYNC + '!A2:F'
  if (silent) Logger.log(msg)
  else notify_(msg)
}

/** Rows needing Gemini (missing, truncated, or prior gemini_error). Optional cap for manual runs. */
function rowsNeedingGenerate_(sh, maxRows) {
  var last = sh.getLastRow()
  if (last < 2) return []
  var n = last - 1
  var vals = sh.getRange(2, 1, n, 5).getValues()
  var out = []
  for (var i = 0; i < vals.length; i++) {
    var t = (vals[i][0] || '').toString().trim()
    if (rowNeedsGenerate_(t, vals[i][1], vals[i][2], vals[i][3], vals[i][4])) {
      out.push(i + 2)
      if (maxRows != null && out.length >= maxRows) break
    }
  }
  return out
}

/** @returns {{ generate: number, push: number }} */
function countCyclePending_(sh) {
  var last = sh.getLastRow()
  if (last < 2) return { generate: 0, push: 0 }
  var n = last - 1
  var vals = sh.getRange(2, 1, n, 5).getValues()
  var gen = 0
  var push = 0
  for (var i = 0; i < vals.length; i++) {
    var t = (vals[i][0] || '').toString().trim()
    if (!t) continue
    var st = (vals[i][4] || '').toString()
    if (rowNeedsGenerate_(t, vals[i][1], vals[i][2], vals[i][3], st)) gen++
    else if (st === 'ready_to_sync') push++
  }
  return { generate: gen, push: push }
}

function cycleIsComplete_(sh) {
  var p = countCyclePending_(sh)
  return p.generate === 0 && p.push === 0
}

function rowNumbersToProcess_(sh) {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var rng = ss.getActiveRange()
  if (rng && rng.getSheet().getName() === SHEET_SYNC && rng.getNumRows() > 0) {
    var rows = []
    var r0 = rng.getRow()
    var r1 = rng.getLastRow()
    for (var r = r0; r <= r1; r++) {
      if (r >= 2) rows.push(r)
    }
    return rows
  }
  return rowsNeedingGenerate_(sh, MAX_ROWS_GENERATE)
}

/**
 * Runs Gemini for each row in rows (row numbers). Stops before Apps Script’s ~6 min limit when budget exceeded.
 * @returns {{ ok: number, stoppedEarly: boolean }}
 */
function generateGeminiForRows_(sh, prompts, rows) {
  var sleepMs = getGeminiSleepMs_()
  var budgetMs = getGenerationBudgetMs_()
  var t0 = Date.now()
  var n = 0
  for (var k = 0; k < rows.length; k++) {
    if (Date.now() - t0 > budgetMs) {
      return { ok: n, stoppedEarly: true }
    }
    var row = rows[k]
    var ticker = (sh.getRange(row, 1).getValue() || '').toString().trim().toUpperCase()
    if (!ticker) continue
    var company = (sh.getRange(row, 6).getValue() || '').toString().trim()
    sh.getRange(row, 5).setValue('generating…')
    SpreadsheetApp.flush()
    try {
      var p1 = substitute_(prompts.moat, ticker, company)
      var p2 = substitute_(prompts.how, ticker, company)
      var p3 = substitute_(prompts.deals, ticker, company)
      var t1 = callGemini_(p1)
      Utilities.sleep(sleepMs)
      var t2 = callGemini_(p2)
      Utilities.sleep(sleepMs)
      var t3 = callGemini_(p3)
      // 1 row × 3 cols (B–D): args are (row, col, numRows, numColumns), not corner cells
      sh.getRange(row, 2, 1, 3).setValues([[t1, t2, t3]])
      sh.getRange(row, 5).setValue('ready_to_sync')
      n++
    } catch (e) {
      sh.getRange(row, 5).setValue('gemini_error: ' + (e.message || String(e)).slice(0, 200))
    }
    Utilities.sleep(sleepMs)
  }
  return { ok: n, stoppedEarly: false }
}

function generateWithGeminiSelectedOrEmpty() {
  var prompts = loadPrompts_()
  var sh = getSyncSheet_()
  var rows = rowNumbersToProcess_(sh)
  if (rows.length === 0) {
    notify_('No rows to generate (need ticker in A and empty B, or select rows on MoatSync).')
    return
  }
  var r = generateGeminiForRows_(sh, prompts, rows)
  if (r.stoppedEarly) {
    notify_(
      'Generated ' +
        r.ok +
        ' row(s), then stopped to stay under Google’s ~6 minute script limit. Run **2** again on the rest (rows with empty B, or select a range).',
    )
  } else {
    notify_('Gemini finished for ' + r.ok + ' row(s).')
  }
}

function pushValidatedToDb(silent, maxPush) {
  if (silent === undefined) silent = false
  if (maxPush === undefined) maxPush = MAX_ROWS_PUSH
  var pass = getPass_()
  var sh = getSyncSheet_()
  var last = sh.getLastRow()
  var ok = 0
  var fail = 0
  for (var row = 2; row <= last && ok + fail < maxPush; row++) {
    var st = (sh.getRange(row, 5).getValue() || '').toString()
    if (st !== 'ready_to_sync') continue
    var ticker = (sh.getRange(row, 1).getValue() || '').toString().trim().toUpperCase()
    var body = (sh.getRange(row, 2).getValue() || '').toString()
    var how = (sh.getRange(row, 3).getValue() || '').toString()
    var deals = (sh.getRange(row, 4).getValue() || '').toString()
    if (!ticker || !body.trim()) continue
    var r = apiPost_({
      passphrase: pass,
      action: 'upsert',
      ticker: ticker,
      body: body,
      how_they_make_money_body: how,
      recent_deals_body: deals,
    })
    if (r.code === 200 && r.json.ok) {
      sh.getRange(row, 5).setValue('synced')
      ok++
    } else {
      sh.getRange(row, 5).setValue('db_error: ' + (r.json.error || r.code).toString().slice(0, 220))
      fail++
    }
    Utilities.sleep(300)
  }
  var msg = 'Push done. OK=' + ok + ' failed=' + fail
  if (silent) Logger.log(msg)
  else notify_(msg)
  return { ok: ok, fail: fail }
}

function runFullPipeline() {
  pullTickersFromDb()
  Utilities.sleep(2000)
  var sh = getSyncSheet_()
  var last = sh.getLastRow()
  var rows = []
  for (var i = 2; i <= last && rows.length < MAX_ROWS_GENERATE; i++) {
    var t = (sh.getRange(i, 1).getValue() || '').toString().trim()
    if (t) rows.push(i)
  }
  var prompts = loadPrompts_()
  var gen = generateGeminiForRows_(sh, prompts, rows)
  if (gen.stoppedEarly) {
    notify_(
      'Full pipeline: generated ' +
        gen.ok +
        ' row(s) then paused (6 min Apps Script limit). Run **2** on remaining rows, then **3**, or run full pipeline again after more rows are ready.',
    )
  }
  pushValidatedToDb()
  return gen.stoppedEarly
}

/**
 * Unattended sync: one time-driven trigger calls this repeatedly until the sheet is done, then rests
 * until MIN_DAYS_BETWEEN_RUNS before starting a new pull+cycle. Does not wipe the sheet mid-cycle.
 */
function scheduledMoatSyncContinue() {
  var props = getProps_()
  var inProgress = props.getProperty(PROP_CYCLE_IN_PROGRESS) === 'true'
  var completedAt = props.getProperty(PROP_CYCLE_COMPLETED)

  if (!inProgress) {
    if (completedAt) {
      var prev = new Date(completedAt).getTime()
      if (Date.now() - prev < MIN_DAYS_BETWEEN_RUNS * 24 * 60 * 60 * 1000) {
        Logger.log('MOAT sync idle — last full cycle completed ' + completedAt)
        return
      }
    }
    pullTickersFromDb(true)
    props.setProperty(PROP_CYCLE_IN_PROGRESS, 'true')
    Logger.log('MOAT sync started new cycle (pulled tickers)')
  }

  var sh = getSyncSheet_()
  var prompts = loadPrompts_()
  var rows = rowsNeedingGenerate_(sh, null)
  var gen = { ok: 0, stoppedEarly: false }
  if (rows.length > 0) {
    gen = generateGeminiForRows_(sh, prompts, rows)
  }
  var push = pushValidatedToDb(true, SCHEDULED_MAX_ROWS_PUSH)
  var pending = countCyclePending_(sh)

  if (cycleIsComplete_(sh)) {
    props.deleteProperty(PROP_CYCLE_IN_PROGRESS)
    props.setProperty(PROP_CYCLE_COMPLETED, new Date().toISOString())
    Logger.log(
      'MOAT sync cycle complete. Last generate batch: ' +
        gen.ok +
        ' row(s). Push OK=' +
        push.ok +
        ' fail=' +
        push.fail,
    )
  } else {
    Logger.log(
      'MOAT sync in progress — generated ' +
        gen.ok +
        ' this run' +
        (gen.stoppedEarly ? ' (time budget)' : '') +
        '; pending generate=' +
        pending.generate +
        ', pending push=' +
        pending.push,
    )
  }
}

/** @deprecated Use scheduledMoatSyncContinue — kept so existing triggers keep working. */
function scheduledBiMonthlyPipeline() {
  scheduledMoatSyncContinue()
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('MOAT sync')
    .addItem('1 Pull tickers from DB', 'pullTickersFromDb')
    .addItem('2 Generate with Gemini (selection or empty B)', 'generateWithGeminiSelectedOrEmpty')
    .addItem('3 Push validated rows to DB', 'pushValidatedToDb')
    .addSeparator()
    .addItem('Run full pipeline (pull → gen → push)', 'runFullPipeline')
    .addToUi()
}
