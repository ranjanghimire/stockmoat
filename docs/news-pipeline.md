# Material news pipeline

Anchor-driven digest: **FMP stock news + press releases** and **SEC EDGAR 8-K** for tickers in `config/news_anchors.v1.yaml`, then **Gemini** scoring into `material_news`.

## Run locally

```bash
# Apply migration in Supabase SQL editor or CLI first.
npm run news:pipeline
```

**Env:** `FMP_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`  
Optional: `GEMINI_MODEL` (default `gemini-2.5-flash`), `SEC_USER_AGENT`, `NEWS_FMP_GAP_MS`, `NEWS_SEC_GAP_MS`.

## GitHub Actions (hourly)

Workflow: `.github/workflows/news-pipeline.yml` — runs at **:20 UTC every hour** (`20 * * * *`) and via **Actions → News pipeline → Run workflow**.

**Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Required |
|--------|----------|
| `FMP_API_KEY` | Yes |
| `GEMINI_API_KEY` | Yes |
| `SUPABASE_URL` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `SEC_USER_AGENT` | No — e.g. `StockMoat/1.0 (contact: you@email.com)` |
| `GEMINI_MODEL` | No |
| `NEWS_FMP_GAP_MS` | No (default 400) |
| `NEWS_SEC_GAP_MS` | No (default 280) |
| `RESEND_KEY` | For digest email |
| `RESEND_SENDER_EMAIL` | For digest email |
| `PUBLIC_APP_URL` | For digest + confirm links |

## Vercel API (optional)

`POST /api/news-pipeline` with `NEWS_PIPELINE_SECRET` and header `x-news-secret` — not scheduled on Vercel by default.

## UI

`/news` — reads `material_news` (anon RLS select). **Subscribe** sends a Resend confirmation email; after confirm, hourly digests go out when the pipeline publishes new items.

### Resend (subscriber email)

Uses the **REST API** (`RESEND_KEY`). In `.env.local` / Vercel / GitHub secrets:

| Variable | Required | Notes |
|----------|----------|--------|
| `RESEND_KEY` | Yes | API key from [Resend](https://resend.com/api-keys) (`re_…`) |
| `RESEND_SENDER_EMAIL` | Yes | From address on a **verified domain** in Resend |
| `PUBLIC_APP_URL` | Yes | Production URL, e.g. `https://stockmoat.vercel.app` |
| `RESEND_SENDER_NAME` | No | Default `StockMoat` |

Apply migration `20260525120000_news_subscribers.sql`. Subscribe API: `POST /api/news-subscribe` with `{ "email": "..." }`.

## Anchors

Edit `config/news_anchors.v1.yaml` quarterly, not daily. Thematic lanes (AI, semis, quantum) use up to ~10 tickers; quiet sectors use 1–3.
