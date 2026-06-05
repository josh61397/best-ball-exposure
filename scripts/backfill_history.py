#!/usr/bin/env python3
"""Backfill historical ADP into data/history/<date>.json from manually
read chart series (e.g. bestballexplorer.com per-player ADP graphs).

Run:
    python3 scripts/backfill_history.py

The series live in `chart_series.json` (sibling of this script). Format:

    {
      "source_label": "bestballexplorer.com (UD)",
      "field": "ud",
      "range": ["2026-05-08", "2026-06-05"],
      "players": [
        {
          "name": "Bijan Robinson",
          "pos": "RB",
          "team": "ATL",
          "baseline": 1.0,
          "overrides": {                  // optional, per-date deviation
            "2026-05-20": 1.5
          }
        },
        ...
      ]
    }

A player's effective series is `baseline` for every date in `range`,
with `overrides` swapping in different values on specific dates.

Per-date `series` dicts are still accepted for backwards compatibility.

Behavior per date:
  - If data/history/<date>.json already exists, merge: for each player in
    the spec, set just the `field` (e.g. "ud") on that player. Other
    players in the file and other fields on the matched player are
    untouched.
  - If the file does not exist, create a new file containing only the
    players in the spec (other ADP fields null).
  - data/history/index.json is rewritten with the union of all dates.

The script is idempotent — running it twice produces the same result.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HISTORY_DIR = ROOT / "data" / "history"
INDEX_PATH = HISTORY_DIR / "index.json"
SPEC_PATH = Path(__file__).resolve().parent / "chart_series.json"

ADP_FIELDS = ["ud", "dk", "drafters", "bb10", "rtsports"]


def _normalize(name: str) -> str:
    """Same lightweight name fold the JS side uses for joins."""
    return name.lower().strip()


def load_spec() -> dict:
    with SPEC_PATH.open() as f:
        return json.load(f)


def load_file(date: str) -> dict | None:
    p = HISTORY_DIR / f"{date}.json"
    if not p.exists():
        return None
    with p.open() as f:
        return json.load(f)


def write_file(date: str, payload: dict) -> None:
    p = HISTORY_DIR / f"{date}.json"
    with p.open("w") as f:
        json.dump(payload, f, separators=(",", ":"))


def make_empty(date: str, source_label: str) -> dict:
    return {
        "date": date,
        "source": source_label,
        "fetchedAt": f"{date}T00:00:00+00:00",
        "players": [],
    }


def merge_player(existing: list[dict], target: dict, field: str, value: float) -> list[dict]:
    """Find target['name'] in existing (by normalized name); update field.
    If not present, append a stub with only this field populated."""
    nkey = _normalize(target["name"])
    for row in existing:
        if _normalize(row.get("name", "")) == nkey:
            row[field] = value
            # Fill team/pos if missing on the existing row.
            row.setdefault("pos", target.get("pos"))
            row.setdefault("team", target.get("team"))
            return existing
    stub = {
        "name": target["name"],
        "pos": target.get("pos"),
        "team": target.get("team"),
    }
    for f in ADP_FIELDS:
        stub[f] = value if f == field else None
    existing.append(stub)
    return existing


def daterange(start: str, end: str) -> list[str]:
    s = datetime.date.fromisoformat(start)
    e = datetime.date.fromisoformat(end)
    out = []
    cur = s
    while cur <= e:
        out.append(cur.isoformat())
        cur += datetime.timedelta(days=1)
    return out


def expand_series(player: dict, default_range: list[str]) -> dict[str, float]:
    """Compose a player's date->ADP series from baseline + overrides
    (or a raw `series` dict if the player uses the old format)."""
    if "series" in player:
        return {k: float(v) for k, v in player["series"].items()}
    baseline = player.get("baseline")
    overrides = player.get("overrides", {})
    if baseline is None and not overrides:
        return {}
    out = {}
    for d in default_range:
        if baseline is not None:
            out[d] = float(baseline)
    for d, v in overrides.items():
        out[d] = float(v)
    return out


def main() -> int:
    spec = load_spec()
    field = spec["field"]
    if field not in ADP_FIELDS:
        print(f"unknown field: {field}")
        return 2
    source_label = spec.get("source_label", "manual backfill")

    default_range: list[str] = []
    if "range" in spec:
        default_range = daterange(spec["range"][0], spec["range"][1])

    # Collect every date referenced across the spec.
    all_dates: set[str] = set()
    expanded: list[tuple[dict, dict[str, float]]] = []
    for p in spec["players"]:
        series = expand_series(p, default_range)
        expanded.append((p, series))
        all_dates.update(series.keys())

    touched: dict[str, int] = {}
    for date in sorted(all_dates):
        payload = load_file(date) or make_empty(date, source_label)
        for p, series in expanded:
            v = series.get(date)
            if v is None:
                continue
            payload["players"] = merge_player(
                payload["players"], p, field=field, value=float(v)
            )
            touched[date] = touched.get(date, 0) + 1
        write_file(date, payload)

    # Rewrite index.json with the union of any existing dates and the
    # ones we just wrote.
    existing_dates: set[str] = set()
    if INDEX_PATH.exists():
        with INDEX_PATH.open() as f:
            existing_dates.update(json.load(f).get("dates", []))
    on_disk = {p.stem for p in HISTORY_DIR.glob("*.json") if p.stem != "index"}
    all_known = sorted(existing_dates | on_disk)
    with INDEX_PATH.open("w") as f:
        json.dump(
            {
                "dates": all_known,
                "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(
                    timespec="seconds"
                ),
            },
            f,
            indent=2,
        )

    print(f"updated {len(touched)} date file(s); spec field={field}")
    for d, n in sorted(touched.items()):
        print(f"  {d}: {n} player(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
