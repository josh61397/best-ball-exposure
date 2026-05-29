#!/usr/bin/env python3
"""Refresh ADP data from FantasyPros best-ball-overall page.

Scrapes the table at https://www.fantasypros.com/nfl/adp/best-ball-overall.php,
normalizes each row into the existing data.js shape, writes:
  - assets/data.js   (consumed by the static site)
  - data/adp.json    (machine-readable snapshot, useful for history)

Exit codes:
  0  -> success
  2  -> scrape failed
  3  -> parse failed
"""

from __future__ import annotations

import datetime
import json
import os
import re
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATA_JS_PATH = ROOT / "assets" / "data.js"
SNAPSHOT_PATH = ROOT / "data" / "adp.json"
HISTORY_DIR = ROOT / "data" / "history"
HISTORY_INDEX_PATH = HISTORY_DIR / "index.json"

ADP_URL = "https://www.fantasypros.com/nfl/adp/best-ball-overall.php"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def fetch_html() -> str:
    resp = requests.get(ADP_URL, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    return resp.text


def parse_table(html: str) -> list[dict]:
    """Parse the FantasyPros best-ball ADP table into a list of player dicts.

    Returns players in the shape consumed by data.js:
      { name, pos, team, ud, dk, ffpc, drafters }
    """
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", {"id": "data"})
    if table is None:
        table = soup.find("table")
    if table is None:
        raise RuntimeError("Could not find ADP table on page")

    # Map header label -> column index. The FantasyPros page has headers like:
    # Rank | Player Team (Bye) | POS | BB10 | RTSports | Underdog | Drafters | DraftKings | AVG
    headers = []
    thead = table.find("thead")
    if thead:
        for th in thead.find_all("th"):
            headers.append(th.get_text(strip=True).lower())
    if not headers:
        raise RuntimeError("Could not parse table headers")

    def col_index(*labels: str) -> int | None:
        for label in labels:
            label = label.lower()
            for i, h in enumerate(headers):
                if h == label or label in h:
                    return i
        return None

    idx_player = col_index("player team (bye)", "player")
    idx_pos = col_index("pos", "position")
    idx_ud = col_index("underdog", "ud")
    idx_dk = col_index("draftkings", "dk")
    idx_drafters = col_index("drafters")
    idx_bb10 = col_index("bb10")
    idx_rts = col_index("rtsports", "rt sports")

    if any(i is None for i in (idx_player, idx_pos)):
        raise RuntimeError(f"Missing core columns in headers: {headers}")

    rows: list[dict] = []
    body = table.find("tbody") or table
    for tr in body.find_all("tr"):
        cells = tr.find_all("td")
        if not cells or len(cells) < 3:
            continue
        # Player cell looks like: "<a>Bijan Robinson</a> ATL (11)" — name in <a>, then team text
        pcell = cells[idx_player]
        a = pcell.find("a")
        if not a:
            continue
        name = a.get_text(strip=True)
        if not name:
            continue
        rest = pcell.get_text(" ", strip=True).replace(name, "", 1).strip()
        # Extract team code (first uppercase token before optional bye)
        m = re.search(r"\b([A-Z]{2,3})\b", rest)
        team = m.group(1) if m else ""

        pos_text = cells[idx_pos].get_text(strip=True)
        # FantasyPros writes "RB1", "WR2" etc — strip trailing rank
        pos_match = re.match(r"([A-Z]+)", pos_text)
        pos = pos_match.group(1) if pos_match else pos_text

        def cell_num(i: int | None) -> float | None:
            if i is None or i >= len(cells):
                return None
            t = cells[i].get_text(strip=True)
            if not t or t in ("-", "—", "N/A"):
                return None
            try:
                return round(float(t), 2)
            except ValueError:
                return None

        rows.append({
            "name": name,
            "pos": pos,
            "team": team,
            "ud": cell_num(idx_ud),
            "dk": cell_num(idx_dk),
            "ffpc": None,  # FantasyPros best-ball-overall does not provide FFPC
            "drafters": cell_num(idx_drafters),
            "bb10": cell_num(idx_bb10),
            "rtsports": cell_num(idx_rts),
        })
    return rows


def load_existing_static() -> dict:
    """Read existing data.js to recover tournaments + schedule (we don't scrape those)."""
    text = DATA_JS_PATH.read_text(encoding="utf-8")
    m = re.search(r"window\.BB_DATA\s*=\s*(\{.*?\});", text, re.DOTALL)
    if not m:
        raise RuntimeError("Could not find BB_DATA assignment in data.js")
    return json.loads(m.group(1))


HELPER_JS = r"""
window.BB_DATA.normalizeName = function(name) {
  if (!name) return '';
  return String(name).toLowerCase()
    .replace(/[.,'`]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
};
window.BB_DATA.adpByName = (function() {
  var map = {};
  for (var i = 0; i < window.BB_DATA.adp.length; i++) {
    var p = window.BB_DATA.adp[i];
    map[window.BB_DATA.normalizeName(p.name)] = p;
  }
  return map;
})();
window.BB_DATA.lookupADP = function(name) {
  return window.BB_DATA.adpByName[window.BB_DATA.normalizeName(name)] || null;
};
"""


def write_data_js(adp: list[dict], existing: dict, source_url: str) -> None:
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    payload = {
        "adp": adp,
        "tournaments": existing.get("tournaments", []),
        "schedule": existing.get("schedule", {}),
        "lastUpdated": now,
        "source": source_url,
    }
    json_blob = json.dumps(payload, separators=(",", ":"))
    out = (
        "// Auto-generated by scripts/refresh_adp.py. Do not edit by hand.\n"
        f"// Last refreshed: {now}\n"
        f"// Source: {source_url}\n"
        f"window.BB_DATA = {json_blob};\n"
        f"{HELPER_JS}"
    )
    DATA_JS_PATH.write_text(out, encoding="utf-8")

    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_PATH.write_text(
        json.dumps(
            {"lastUpdated": now, "source": source_url, "adp": adp},
            indent=2,
        ),
        encoding="utf-8",
    )


def write_history(adp: list[dict], source_url: str) -> str:
    """Append today's snapshot to data/history/.

    Each day file is a compact array of {name, pos, team, ud, dk, drafters, bb10, rtsports}.
    index.json lists every available date so the frontend can enumerate them
    without directory listing (GitHub Pages doesn't expose it).
    """
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    day_path = HISTORY_DIR / f"{today}.json"

    compact = [
        {
            "name": p["name"],
            "pos": p["pos"],
            "team": p["team"],
            "ud": p.get("ud"),
            "dk": p.get("dk"),
            "drafters": p.get("drafters"),
            "bb10": p.get("bb10"),
            "rtsports": p.get("rtsports"),
        }
        for p in adp
    ]
    day_payload = {
        "date": today,
        "source": source_url,
        "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "players": compact,
    }
    day_path.write_text(json.dumps(day_payload, separators=(",", ":")), encoding="utf-8")

    # Update the index — keep dates sorted ascending, dedupe.
    existing_dates: list[str] = []
    if HISTORY_INDEX_PATH.exists():
        try:
            existing_dates = json.loads(HISTORY_INDEX_PATH.read_text())["dates"]
        except Exception:
            existing_dates = []
    dates_set = set(existing_dates)
    dates_set.add(today)
    dates = sorted(dates_set)
    HISTORY_INDEX_PATH.write_text(
        json.dumps({"dates": dates, "updatedAt": day_payload["fetchedAt"]}, indent=2),
        encoding="utf-8",
    )
    return today


def main() -> int:
    print(f"Fetching {ADP_URL}", flush=True)
    try:
        html = fetch_html()
    except Exception as exc:
        print(f"ERROR: scrape failed — {exc}", file=sys.stderr)
        return 2
    try:
        adp = parse_table(html)
    except Exception as exc:
        print(f"ERROR: parse failed — {exc}", file=sys.stderr)
        return 3
    if not adp:
        print("ERROR: parsed 0 rows", file=sys.stderr)
        return 3
    print(f"Parsed {len(adp)} players", flush=True)

    try:
        existing = load_existing_static()
    except Exception as exc:
        print(f"Warning: could not load existing data.js ({exc}); proceeding with empty schedule/tournaments", file=sys.stderr)
        existing = {"tournaments": [], "schedule": {}}

    write_data_js(adp, existing, ADP_URL)
    print(f"Wrote {DATA_JS_PATH.relative_to(ROOT)} and {SNAPSHOT_PATH.relative_to(ROOT)}", flush=True)
    day = write_history(adp, ADP_URL)
    print(f"Wrote history snapshot for {day}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
