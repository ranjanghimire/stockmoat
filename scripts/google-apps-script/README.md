# MOAT snapshot pipeline (Google Sheets + Apps Script + Gemini)

This automates: **pull tickers from StockMoat DB → Gemini generates 3 paragraphs in the sheet → push validated rows back to Supabase** as `content_source = curated`.

The Vercel API lives in the repo at `api/moat-sheet-pipeline.ts` (same passphrase as `/admin/moat-snapshot`: `MOAT_ADMIN_PASSPHRASE`).

---

## 1. Two tabs in your spreadsheet

### Tab `Config` (exact name)


|     | A            | B (your prompt templates — use `{{TICKER}}` where the symbol goes) |
| --- | ------------ | ------------------------------------------------------------------ |
| 1   | prompt_moat  | *(paste your “what’s the moat” prompt)*                            |
| 2   | prompt_how   | *(paste your “how they make money” prompt)*                        |
| 3   | prompt_deals | *(paste your “recent deals & partnerships” prompt)*                |


Example for deals (same idea you used with the extension):

> Give me a meaningful-only recent deals & partnerships summary for ticker **{{TICKER}}** — short, precise, factual, and only if the partnership is truly material. If nothing meaningful exists, say so plainly. One paragraph, no bullets.

### Tab `MoatSync` (exact name)


| A (Ticker)                  | B (Moat)   | C (How they make money) | D (Recent deals) | E (Status) |
| --------------------------- | ---------- | ----------------------- | ---------------- | ---------- |
| *(filled by script step 1)* | *(Gemini)* | *(Gemini)*              | *(Gemini)*       | *(script)* |


- Row **1** = headers (script writes data from **row 2** downward).
- Do not put formulas in B–D; the script overwrites them.

---

## 2. Script properties (secrets)

In the spreadsheet: **Extensions → Apps Script →** gear icon **Project Settings → Script properties** (not cells):


| Property                | Example value                                                             |
| ----------------------- | ------------------------------------------------------------------------- |
| `MOAT_PIPELINE_API`     | `https://stockmoat.vercel.app` (no trailing slash)                        |
| `MOAT_ADMIN_PASSPHRASE` | Same secret as Vercel `MOAT_ADMIN_PASSPHRASE`                             |
| `GEMINI_API_KEY`        | Your Google AI Studio / Gemini API key                                    |
| `GEMINI_MODEL`          | Optional. Default `gemini-2.0-flash`. You can try `gemini-1.5-flash` etc. |


**Never** put the Supabase service key in the sheet — only Vercel has that.

---

## 3. Install the script

1. **Extensions → Apps Script**
2. Delete any boilerplate in `Code.gs`
3. Copy the entire contents of **`Code.gs`** from this folder into the editor
4. **Save** (disk icon)
5. First run: choose **`authorizeTestCall`** from the function dropdown, **Run**, and complete Google’s OAuth consent (UrlFetch to your domain + Google’s Gemini API).

---

## 4. Menu (after first save)

Reload the spreadsheet. You should see **MOAT sync** in the menu with:

- **1 Pull tickers from DB** — fills column A from `screen_scores ∪ ticker_fmp_home_cache ∪ company_moat_summaries`
- **2 Generate with Gemini (selected rows)** — uses `Config` prompts; fill column A first (or pull). If nothing selected, processes rows where A is non-empty and B is empty (up to 30 rows per run).
- **3 Push validated rows to DB** — POSTs rows where B,C,D look filled and pass server validation (up to 40 rows per run).
- **Run full pipeline (pull → generate → push)** — runs all three with small pauses (long; may hit the 6-minute limit for huge universes — run 2 in batches if needed).

---

## 5. Bi-monthly unattended run

**Triggers** (clock icon in Apps Script):

- **Add trigger** → function **`scheduledBiMonthlyPipeline`** → **Time-driven** → **Month timer** → **On day 1** (or your preference).

Inside `scheduledBiMonthlyPipeline`, the script checks **`LAST_MOAT_PIPELINE_RUN`** (stored automatically in Script Properties). It only runs the heavy pipeline if **≥ 55 days** have passed since the last successful run. Adjust `MIN_DAYS_BETWEEN_RUNS` in `Code.gs` if you want stricter “every 2 months”.

---

## 6. Troubleshooting


| Symptom                        | What to check                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `setValues` row count mismatch | The script’s `getRange` uses **numRows**, not last row index — use the latest `Code.gs` from this repo.                     |
| Pull fails                     | `MOAT_PIPELINE_API`, passphrase, Vercel env `MOAT_ADMIN_PASSPHRASE` / `SUPABASE_*`                                           |
| Gemini fails                   | `GEMINI_API_KEY`, quota, model name                                                                                         |
| Push returns 400               | Server rejected text (too short, IR filler, blocklist). Read **Status** column message; fix prompt or row and re-run step 3 |
| 6 min timeout                  | Run **2** on fewer rows (select a range) or increase `MAX_ROWS_PER_GENERATE_RUN` in small steps                            |


---

## Files

- `Code.gs` — paste into Apps Script editor
- `README.md` — this file
