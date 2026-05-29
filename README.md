# Best Ball Exposure

A static, browser-only best ball exposure tracker.

- Drop in Underdog, DraftKings, or Drafters roster CSVs — all parsing happens in your browser
- All roster data stays in `localStorage`; nothing leaves the browser
- ADP refreshes daily from [FantasyPros best-ball-overall](https://www.fantasypros.com/nfl/adp/best-ball-overall.php) via a scheduled GitHub Action

## Pages

- `index.html` — upload and manage CSVs, see upload history
- `exposures.html` — player exposure dashboard with sortable ADP columns and CLV coloring
- `rosters.html` — per-roster picks, stacks, CLV
- `tournaments.html` — your entries grouped by tournament + the 2026 tournament reference list

## How it stays fresh

`.github/workflows/refresh-adp.yml` runs daily at 10:00 UTC:

1. Runs `scripts/refresh_adp.py` against FantasyPros
2. Writes `assets/data.js` + `data/adp.json`
3. Commits the change back to `main` if anything actually moved

The push triggers `.github/workflows/pages.yml`, which redeploys to GitHub Pages.

## Run locally

```sh
python3 -m http.server 8731
# open http://localhost:8731
```

## Manually refresh ADP

```sh
pip install requests beautifulsoup4
python scripts/refresh_adp.py
```
