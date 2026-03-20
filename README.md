# INKTHORN Intelligence Dashboard

A Miami synthwave-styled static web dashboard that aggregates data published by multiple AI agents. Hosted on GitHub Pages. No backend required — agents publish JSON, the dashboard renders it.

---

## What It Is

InkThorn is a personal intelligence dashboard. Agents run on schedule (via GitHub Actions or external cron), scrape/process data, and commit JSON files to `data/`. The dashboard reads those files at page load and renders them as beautiful neon-lit panels.

---

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Source**, select **Deploy from a branch**.
4. Choose branch: `main`, folder: `/ (root)`.
5. Save. GitHub Pages will serve `index.html` at `https://YOUR_USERNAME.github.io/YOUR_REPO/`.

> **Note:** Because the dashboard fetches JSON via `fetch()`, you must serve it over HTTP (not `file://`). GitHub Pages handles this correctly.

---

## Automated Data Updates

The included GitHub Actions workflow (`.github/workflows/update.yml`) runs daily at 8:00 AM CDT and scrapes WWOZ Livewire for that day's live music. It commits any changes back to the repo, which automatically re-deploys the Pages site.

To trigger manually: go to **Actions → Update Dashboard Data → Run workflow**.

---

## Agent Publishing Protocol

Agents publish data by writing JSON files to the `data/` directory and committing/pushing to the repo. The dashboard fetches these files directly.

### Adding a New Panel

1. **Add a panel entry to `data/manifest.json`:**

```json
{
  "id": "my-panel",
  "label": "🔥 My Panel",
  "agent": "My-Agent",
  "type": "digest",
  "data": "data/my-panel.json",
  "description": "What this panel shows"
}
```

2. **Create the data file** (e.g. `data/my-panel.json`) using the schema below.

3. **If you need a custom renderer**, add a `renderMyPanel(data, el)` function to `assets/app.js` and register it in `RENDERERS`:

```js
const RENDERERS = {
  'live-music': renderLiveMusic,
  'weather':    renderWeather,
  'digest':     renderDigest,
  'my-panel':   renderMyPanel,  // ← add here
};
```

---

## Data Schemas

### Pending / Not Yet Available

Any panel data file can return this to show the "agent hasn't published" state:

```json
{
  "agent": "Rob-Agent",
  "updated": null,
  "status": "pending",
  "message": "Human-readable reason"
}
```

---

### Live Music (`type: "live-music"`)

```json
{
  "agent": "Rob-Agent",
  "updated": "2026-03-20T22:00:00Z",
  "source": "WWOZ Livewire",
  "date": "Friday, March 20, 2026",
  "shows": [
    {
      "time": "10:00pm",
      "time_sort": 2200,
      "artist": "Kermit Ruffins & The BBQ Swingers",
      "venue": "Blue Nile",
      "genre": "Jazz",
      "neighborhood": "Marigny"
    }
  ]
}
```

**Fields:**
| Field | Type | Description |
|---|---|---|
| `time` | string | Display time, e.g. `"9:00pm"` |
| `time_sort` | number | 24h integer for sorting, e.g. `2100`. Post-midnight: `100` = 1:00am |
| `artist` | string | Artist or act name |
| `venue` | string | Venue name |
| `genre` | string | One of: Jazz, Brass, Funk, Rock, Blues, Zydeco, Cajun, World, Electronic, Soul, R&B, Reggae, Singer-Songwriter, Other |
| `neighborhood` | string | Optional neighborhood label |

---

### Weather (`type: "weather"`)

```json
{
  "agent": "Rob-Agent",
  "updated": "2026-03-20T14:00:00Z",
  "current": {
    "icon": "⛅",
    "temp_f": 74,
    "feels_like_f": 76,
    "description": "Partly cloudy",
    "humidity": 72,
    "wind_mph": 8,
    "location": "New Orleans, LA"
  }
}
```

---

### Daily Digest (`type: "digest"`)

```json
{
  "agent": "Rob-Agent",
  "updated": "2026-03-20T08:00:00Z",
  "items": [
    {
      "category": "News",
      "headline": "Big thing happened today",
      "body": "More details about the thing.",
      "time": "8:00 AM"
    }
  ]
}
```

---

## Tech Stack

- **Zero dependencies** — pure HTML, CSS, vanilla JS
- **Google Fonts** — Orbitron (headers), Rajdhani (body)
- **GitHub Pages** — static hosting
- **GitHub Actions** — automated data updates
- **Node.js built-ins only** — scraper uses `https`, `fs`, `path`, `url`

---

## Design System

| Token | Value | Use |
|---|---|---|
| `--bg-base` | `#070711` | Page background |
| `--pink` | `#ff2d87` | Logo, times, accents |
| `--cyan` | `#00f5ff` | Active tabs, venues, links |
| `--purple` | `#a855f7` | Panel titles, card borders |
| `--font-display` | Orbitron | Logo, headers, badges |
| `--font-body` | Rajdhani | Body text, descriptions |

---

*Built with InkThorn Agents · New Orleans, LA*
