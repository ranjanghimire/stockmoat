#!/usr/bin/env python3
"""
Read fulltxt.csv (ticker, ticker_description, whatsthemoat, howmakemoney) and emit
a Supabase migration that upserts public.company_moat_summaries.

Usage:
  python3 scripts/generate_moat_bulk_migration.py /path/to/fulltxt.csv \\
    supabase/migrations/YYYYMMDDHHMMSS_seed_company_moat_summaries_bulk.sql
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path


def sql_literal(s: str) -> str:
    return "'" + s.replace("\\", "\\\\").replace("'", "''") + "'"


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    if not src.is_file():
        print(f"Missing CSV: {src}", file=sys.stderr)
        return 1

    rows: dict[str, tuple[str, str]] = {}
    with src.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        expected = {"ticker", "ticker_description", "whatsthemoat", "howmakemoney"}
        if reader.fieldnames is None or not expected.issubset(set(reader.fieldnames)):
            print(f"Unexpected columns: {reader.fieldnames}", file=sys.stderr)
            return 1
        for rec in reader:
            sym = (rec.get("ticker") or "").strip().upper()
            moat = (rec.get("whatsthemoat") or "").strip()
            how = (rec.get("howmakemoney") or "").strip()
            if not sym or not moat:
                continue
            rows[sym] = (moat, how)

    dst.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = [
        "-- Bulk seed: curated moat + how they make money (generated; do not hand-edit rows).",
        "",
        "insert into public.company_moat_summaries (symbol, body, how_they_make_money_body)",
        "values",
    ]

    items = sorted(rows.items(), key=lambda x: x[0])
    value_lines = []
    for sym, (moat, how) in items:
        how_sql = sql_literal(how) if how else "null"
        value_lines.append(f"  ({sql_literal(sym)}, {sql_literal(moat)}, {how_sql})")

    lines.append(",\n".join(value_lines))
    lines.extend(
        [
            "",
            "on conflict (symbol) do update set",
            "  body = excluded.body,",
            "  how_they_make_money_body = excluded.how_they_make_money_body,",
            "  updated_at = now();",
            "",
        ]
    )

    dst.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {len(items)} rows to {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
