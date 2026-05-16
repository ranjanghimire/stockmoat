# MOAT snapshot pipeline (Google Sheets + Apps Script + Gemini)

This automates: **pull tickers from StockMoat DB → Gemini generates 3 paragraphs in the sheet → push validated rows back to Supabase** as `content_source = curated`.

The Vercel API lives in the repo at `api/moat-sheet-pipeline.ts` (same passphrase as `/admin/moat-snapshot`: `MOAT_ADMIN_PASSPHRASE`).

---

## 1. Two tabs in your spreadsheet

### Tab `Config` (exact name)


|     | A            | B (prompt templates — use `{{TICKER}}` and `{{COMPANY_NAME}}`) |
| --- | ------------ | ---------------------------------------------------------------- |
| 1   | prompt_moat  | *(paste your “what’s the moat” prompt)*                          |
| 2   | prompt_how   | *(paste your “how they make money” prompt)*                      |
| 3   | prompt_deals | *(paste your “recent deals & partnerships” prompt)*              |

**Why two placeholders:** Short symbols like `AA` are ambiguous to the model (American Airlines, Alcoholics Anonymous, etc.). After **Pull tickers**, column **F** is filled from the DB (`screen_scores.display_name`) when available. Your prompts should name the issuer explicitly, e.g. “the **listed** company **{{COMPANY_NAME}}** (ticker **{{TICKER}}**)” and ask the model to ignore homonyms and non‑public entities.

Example for deals:

> For the **listed public company** **{{COMPANY_NAME}}** (ticker **{{TICKER}}**), give a meaningful-only recent deals & partnerships summary — short, precise, factual, and only if the partnership is truly material. If nothing meaningful exists, say so plainly. One paragraph, no bullets. If **{{COMPANY_NAME}}** is empty, use **{{TICKER}}** as the NYSE/Nasdaq symbol only and do not substitute unrelated “AA” meanings.

### Tab `MoatSync` (exact name)


| A (Ticker)                  | B (Moat)   | C (How they make money) | D (Recent deals) | E (Status) | F (Company from DB) |
| --------------------------- | ---------- | ----------------------- | ---------------- | ---------- | ------------------- |
| *(pull step 1)*             | *(Gemini)* | *(Gemini)*              | *(Gemini)*       | *(script)* | *(pull: display name when known)* |


- Row **1** = headers (script sets **F1** to `Company (DB)` if it was blank). Data starts at **row 2**.
- Do not put formulas in B–D; the script overwrites them. You may **edit F** manually (e.g. if a symbol has no DB name yet) before running Generate.

---

## 2. Script properties (secrets)

In the spreadsheet: **Extensions → Apps Script →** gear icon **Project Settings → Script properties** (not cells):


| Property                | Example value                                                             |
| ----------------------- | ------------------------------------------------------------------------- |
| `MOAT_PIPELINE_API`     | `https://stockmoat.vercel.app` (no trailing slash)                        |
| `MOAT_ADMIN_PASSPHRASE` | Same secret as Vercel `MOAT_ADMIN_PASSPHRASE`                             |
| `GEMINI_API_KEY`        | Your Google AI Studio / Gemini API key                                    |
| `GEMINI_MODEL`          | Optional. Default `gemini-2.5-flash`. If Gemini returns **404 / model not available**, set this to `gemini-1.5-flash` (see [Gemini models](https://ai.google.dev/gemini-api/docs/models)). |
| `GEMINI_SLEEP_MS`       | Optional. Milliseconds between sequential Gemini calls (default **400**). Increase (e.g. `800`) if you hit rate limits; decrease only if you stay under quota. |
| `GEMINI_GENERATION_BUDGET_MS` | Optional. Stop starting new rows after this many ms (default **270000** ≈ 4.5 min) so the script exits before Google’s **~6 minute** hard limit. Increase up to **330000** only if runs stay fast. |


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

- **1 Pull tickers from DB** — fills **A** (symbols) and **F** (display name from `screen_scores` when present) from `screen_scores ∪ ticker_fmp_home_cache ∪ company_moat_summaries`
- **2 Generate with Gemini (selected rows)** — uses `Config` prompts; fill column A first (or pull). If nothing selected, processes rows where A is non-empty and B is empty (up to 30 rows per run). Long runs stop **before** Google’s ~6 minute limit when needed; run **2** again on the rest.
- **3 Push validated rows to DB** — POSTs rows where B,C,D look filled and pass server validation (up to 40 rows per run).
- **Run full pipeline (pull → generate → push)** — runs all three with small pauses (long; may hit the 6-minute limit for huge universes — run 2 in batches if needed).

---

## 5. Bi-monthly unattended run

**Triggers** (clock icon in Apps Script):

- **Add trigger** → function **`scheduledBiMonthlyPipeline`** → **Time-driven** → **Month timer** → **On day 1** (or your preference).

**Skip rule:** if `LAST_MOAT_PIPELINE_RUN` is set and fewer than **`MIN_DAYS_BETWEEN_RUNS`** days have passed since that timestamp, the function returns and does nothing.

**When the run “counts”:** after `runFullPipeline()`, the script sets `LAST_MOAT_PIPELINE_RUN` **only if** generation finished **without** hitting the time budget (no early stop). So a **partial** generate (stopped ~4.5 min in) **does not** move the clock forward — you avoid the failure mode where one partial run reset the 55‑day timer and blocked catch‑up for almost two more months.

**Caveats:** The skip rule is still “≥ `MIN_DAYS` since **last recorded** success.” If your clock trigger fires **more often** than that (e.g. monthly) but the last **full** success was recent, the trigger may still skip until `MIN_DAYS` elapses; use manual **2**/**3** for extra batches, lower `MIN_DAYS_BETWEEN_RUNS`, or a less frequent trigger. If **`LAST_MOAT_PIPELINE_RUN` has never been set**, every trigger runs until one full generate completes—prefer **weekly/monthly**, not **daily**, unless you want that. Each invocation still **pushes** rows that reached `ready_to_sync`.

---

## 6. Troubleshooting


| Symptom                        | What to check                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `setValues` row/column mismatch | `getRange` uses **numRows** and **numColumns** (not bottom-right cell). Pull uses `getRange(2,1,out.length,6)`; Gemini output uses `getRange(row,2,1,3)` for one row across B–D. |
| Pull fails                     | `MOAT_PIPELINE_API`, passphrase, Vercel env `MOAT_ADMIN_PASSPHRASE` / `SUPABASE_*`                                           |
| Gemini HTTP 404 (model)        | Set Script property `GEMINI_MODEL` to `gemini-1.5-flash` or another current model from Google AI Studio. Older defaults like `gemini-2.0-flash` may be blocked for new keys. |
| Gemini fails (other)           | `GEMINI_API_KEY`, quota, wrong model id                                                                                    |
| Push returns 400               | Server rejected text (too short, IR filler, blocklist). Read **Status** column message; fix prompt or row and re-run step 3 |
| Wrong company (e.g. `AA`)      | Use **`{{COMPANY_NAME}}`** in all three prompts; confirm **F** matches the issuer you want; redeploy API so `tickers` returns `entries` with display names |
| **Exceeded maximum execution time** | Google caps one run at **~6 minutes**. The script uses a **time budget** and stops partway through large batches so you can run **2** again on the rest. Select fewer rows per run if you prefer one shot; tune `GEMINI_SLEEP_MS` / `GEMINI_GENERATION_BUDGET_MS` in Script properties. |


---

## Files

- `Code.gs` — paste into Apps Script editor
- `README.md` — this file
