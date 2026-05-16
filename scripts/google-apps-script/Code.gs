/**
 * StockMoat — MoatSync pipeline (Google Sheets + Gemini + Vercel API)
 *
 * Setup: see scripts/google-apps-script/README.md
 * Tabs required: "Config" (prompts in B1:B3), "MoatSync" (data from row 2, columns A–E)
 */

var SHEET_SYNC = 'MoatSync'
var SHEET_CONFIG = 'Config'
var MIN_DAYS_BETWEEN_RUNS = 55
var MAX_ROWS_GENERATE = 30
var MAX_ROWS_PUSH = 40
var GEMINI_SLEEP_MS = 1200

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
  return getProps_().getProperty('GEMINI_MODEL') || 'gemini-2.0-flash'
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
    throw new Error('Config!B1:B3 must all contain prompt templates (with {{TICKER}}).')
  }
  return { moat: moat, how: how, deals: deals }
}

function substitute_(template, ticker) {
  return template.split('{{TICKER}}').join(ticker)
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
      generationConfig: { temperature: 0.35, maxOutputTokens: 2048 },
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
  var sh = getSyncSheet_()
  var last = sh.getLastRow()
  if (last >= 2) {
    // numRows = last - 1 so we clear rows 2 … last (not last+1 extra blank row)
    sh.getRange(2, 1, last - 1, 5).clearContent()
  }
  if (list.length === 0) return
  var out = list.map(function (s) {
    return [s]
  })
  // getRange(row, column, numRows, numColumns) — 3rd arg is ROW COUNT, not last row index
  sh.getRange(2, 1, list.length, 1).setValues(out)
  notify_('Pulled ' + list.length + ' tickers into ' + SHEET_SYNC + '!A2:A')
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

function generateWithGeminiSelectedOrEmpty() {
  var prompts = loadPrompts_()
  var sh = getSyncSheet_()
  var rows = rowNumbersToProcess_(sh)
  if (rows.length === 0) {
    notify_('No rows to generate (need ticker in A and empty B, or select rows on MoatSync).')
    return
  }
  var n = 0
  for (var k = 0; k < rows.length; k++) {
    var row = rows[k]
    var ticker = (sh.getRange(row, 1).getValue() || '').toString().trim().toUpperCase()
    if (!ticker) continue
    sh.getRange(row, 5).setValue('generating…')
    SpreadsheetApp.flush()
    try {
      var p1 = substitute_(prompts.moat, ticker)
      var p2 = substitute_(prompts.how, ticker)
      var p3 = substitute_(prompts.deals, ticker)
      var t1 = callGemini_(p1)
      Utilities.sleep(GEMINI_SLEEP_MS)
      var t2 = callGemini_(p2)
      Utilities.sleep(GEMINI_SLEEP_MS)
      var t3 = callGemini_(p3)
      sh.getRange(row, 2, row, 4).setValues([[t1, t2, t3]])
      sh.getRange(row, 5).setValue('ready_to_sync')
      n++
    } catch (e) {
      sh.getRange(row, 5).setValue('gemini_error: ' + (e.message || String(e)).slice(0, 200))
    }
    Utilities.sleep(GEMINI_SLEEP_MS)
  }
  notify_('Gemini finished for ' + n + ' row(s).')
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
  for (var k = 0; k < rows.length; k++) {
    var row = rows[k]
    var ticker = (sh.getRange(row, 1).getValue() || '').toString().trim().toUpperCase()
    sh.getRange(row, 5).setValue('generating…')
    SpreadsheetApp.flush()
    try {
      var t1 = callGemini_(substitute_(prompts.moat, ticker))
      Utilities.sleep(GEMINI_SLEEP_MS)
      var t2 = callGemini_(substitute_(prompts.how, ticker))
      Utilities.sleep(GEMINI_SLEEP_MS)
      var t3 = callGemini_(substitute_(prompts.deals, ticker))
      sh.getRange(row, 2, row, 4).setValues([[t1, t2, t3]])
      sh.getRange(row, 5).setValue('ready_to_sync')
    } catch (e) {
      sh.getRange(row, 5).setValue('gemini_error: ' + (e.message || String(e)).slice(0, 200))
    }
    Utilities.sleep(GEMINI_SLEEP_MS)
  }
  pushValidatedToDb()
}

/** Time-driven trigger target — skips if last run was within MIN_DAYS_BETWEEN_RUNS. */
function scheduledBiMonthlyPipeline() {
  var last = getProps_().getProperty('LAST_MOAT_PIPELINE_RUN')
  if (last) {
    var prev = new Date(last).getTime()
    if (Date.now() - prev < MIN_DAYS_BETWEEN_RUNS * 24 * 60 * 60 * 1000) {
      return
    }
  }
  runFullPipeline()
  getProps_().setProperty('LAST_MOAT_PIPELINE_RUN', new Date().toISOString())
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
