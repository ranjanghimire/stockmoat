# Material news pipeline

Anchor-driven digest: **FMP stock news + press releases** and **SEC EDGAR 8-K** for tickers in `config/news_anchors.v1.yaml`, then **Gemini** scoring into `material_news`.

## Run locally

```bash
# Apply migration in Supabase SQL editor or CLI first.
npm run news:pipeline
```

**Env:** `FMP_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`  
Optional: `GEMINI_MODEL` (default `gemini-2.5-flash`), `SEC_USER_AGENT`, `NEWS_FMP_GAP_MS`, `NEWS_SEC_GAP_MS`, `NEWS_PIPELINE_SECRET` (for API).

## Vercel cron (optional)

`POST /api/news-pipeline` with header `x-news-secret: <NEWS_PIPELINE_SECRET>`.

## UI

`/news` — reads `material_news` (anon RLS select).

## Anchors

Edit `config/news_anchors.v1.yaml` quarterly, not daily. Thematic lanes (AI, semis, quantum) use up to ~10 tickers; quiet sectors use 1–3.
