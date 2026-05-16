/**
 * StockMoat — MoatSync pipeline (Google Sheets + Gemini + Vercel API)
 *
 * Setup: see scripts/google-apps-script/README.md
 * Tabs required: "Config" (prompts in B1:B3), "MoatSync" (data from row 2, columns A–F; F = company name from DB for disambiguation)
 */

var SHEET_SYNC = 'MoatSync'
var SHEET_CONFIG = 'Config'
var MIN_DAYS_BETWEEN_RUNS = 55
var MAX_ROWS_GENERATE = 30
var MAX_ROWS_PUSH = 40
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

function callGemini_(userPrompt) {
  var key = getGeminiKey_()
  var model = getGeminiModel_()
  var url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    model +
    ':generateContent?key=' +
    encodeURIComponent(key)
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 1024 },
    }),
  })
  if (res.getResponseCode() !== 200) {
    throw new Error('Gemini HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 500))
  }
  var body = JSON.parse(res.getContentText())
  var parts = (((body || {}).candidates || [])[0] || {}).content || {}
  var pts = parts.parts || []
  var text = (pts[0] && pts[0].text) ? String(pts[0].text).trim() : ''
  if (!text) throw new Error('Empty Gemini response')
  return text.replace(/\r\n/g, '\n').trim()
}

function pullTickersFromDb() {
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
  notify_('Pulled ' + list.length + ' tickers into ' + SHEET_SYNC + '!A2:F')
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
  var last = sh.getLastRow()
  var out = []
  for (var i = 2; i <= last && out.length < MAX_ROWS_GENERATE; i++) {
    var t = (sh.getRange(i, 1).getValue() || '').toString().trim()
    var b = (sh.getRange(i, 2).getValue() || '').toString().trim()
    if (t && !b) out.push(i)
  }
  return out
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

function pushValidatedToDb() {
  var pass = getPass_()
  var sh = getSyncSheet_()
  var last = sh.getLastRow()
  var ok = 0
  var fail = 0
  for (var row = 2; row <= last && ok + fail < MAX_ROWS_PUSH; row++) {
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
  notify_('Push done. OK=' + ok + ' failed=' + fail)
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
 * Time-driven trigger target — skips if LAST_MOAT_PIPELINE_RUN is within MIN_DAYS_BETWEEN_RUNS.
 * On a partial generate (time budget), LAST_MOAT_PIPELINE_RUN is not updated so the 55-day clock
 * is not reset from “today”; the next fire still follows the last full completion date.
 */
function scheduledBiMonthlyPipeline() {
  var last = getProps_().getProperty('LAST_MOAT_PIPELINE_RUN')
  if (last) {
    var prev = new Date(last).getTime()
    if (Date.now() - prev < MIN_DAYS_BETWEEN_RUNS * 24 * 60 * 60 * 1000) {
      return
    }
  }
  var stoppedEarly = runFullPipeline()
  if (!stoppedEarly) {
    getProps_().setProperty('LAST_MOAT_PIPELINE_RUN', new Date().toISOString())
  }
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
