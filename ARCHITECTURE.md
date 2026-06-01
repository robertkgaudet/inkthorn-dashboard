# InkThorn Frontend Architecture
**Document version:** 2026-06-01  
**Scope:** `notes.html` and `daycycle.html` — the two primary user-facing pages of the InkThorn application  
**Audience:** Development architects and engineers

---

## 1. Overview

InkThorn is a single-tenant personal productivity application delivered as a **static frontend** (GitHub Pages) backed by a **Cloudflare Worker API**. There is no build step, no framework, and no bundler — both pages are self-contained HTML files with embedded CSS and vanilla JavaScript.

The two pages share a common auth layer (Google OAuth via the Worker) and a common Supabase-backed data store, but are architecturally independent in terms of rendering and state.

---

## 2. Hosting & Delivery

| Layer | Technology |
|---|---|
| Frontend host | GitHub Pages (`robertkgaudet/inkthorn-dashboard`) |
| API / Auth backend | Cloudflare Worker (`inkthorn-notes.rgaudet2023.workers.dev`) |
| Database | Supabase (PostgreSQL) |
| Auth provider | Google OAuth 2.0 |
| Token format | JWT (signed by Worker, stored in `localStorage`) |

Both pages live in the repo root and are served directly as static files. No server-side rendering. All data fetching happens client-side via `fetch()` calls to the Worker API.

---

## 3. Authentication Flow

Both pages share an identical auth mechanism:

1. **User lands on `notes.html`** (the auth entry point).
2. Unauthenticated users see a **login overlay** (`#loginOverlay`) with a "Continue with Google" button.
3. The button redirects to:  
   `https://inkthorn-notes.rgaudet2023.workers.dev/auth/google`
4. The Worker handles the OAuth 2.0 PKCE flow with Google, creates or retrieves the user record in Supabase, and redirects back to `notes.html?token=<JWT>`.
5. The frontend strips the token from the URL, stores it in `localStorage` under key `inkthorn_token`, and uses it as a `Bearer` token on all subsequent API calls.
6. `daycycle.html` reads the same `localStorage` key. If absent, it immediately redirects to `notes.html`.

**Token expiry:** The JWT payload contains an `exp` field. On init, both pages parse the payload with a base64 decode and reject expired tokens, clearing storage and forcing re-auth.

---

## 4. `notes.html` — Note Management App

### 4.1 Purpose
The primary note capture and task management interface. Users can create, categorize, prioritize, schedule, and delete notes. It is also the authentication entry point for the entire application.

### 4.2 Visual Design
- **Aesthetic:** Classic dark editorial — deep warm blacks, gold (`#c9a84c`) accents, crimson red (`#c0392b`) for priority A
- **Fonts:** Playfair Display (headings / character voice), Inter (UI copy)
- **Brand character:** InkThorn — a grumpy, dapper red lobster with a personality; his voice appears in inline quips, placeholders, and toast notifications

### 4.3 Application State

All state is module-scoped JavaScript variables (no framework):

| Variable | Purpose |
|---|---|
| `notesCache` | In-memory array of all notes from the API |
| `currentUser` | JWT payload of the authenticated user |
| `currentSection` | Active tab: `daily` / `ideas` / `projects` / `someday` |
| `currentView` | Within Daily: `week` or `day` |
| `currentDate` | The selected date in Day View |
| `currentWeekOffset` | Week navigation offset from current week (±n) |
| `currentPriorityFilter` | Active filter in Day View: `all` / `A` / `B` / `C` / `done` |
| `currentLayoutMode` | Day View layout: `list` or `planner` |
| `isPro` | Boolean — set from `/api/me` response, gates free tier cap |

### 4.4 Local Meta System

Supabase stores note text and category only. All **task metadata** (priority, done state, scheduled date, time slot) is stored **client-side** in `localStorage` under the key `inkthorn_daytimer_meta`.

This is a flat key/value store keyed by `note.id`:

```json
{
  "<note-id>": {
    "priority": "A",
    "done": false,
    "scheduled_date": "2026-06-01",
    "time_slot": 9
  }
}
```

**Implication:** Meta is device-local. If a user switches devices, priority and done state do not follow. This is a known limitation, not a bug.

### 4.5 Section Navigation

Four tabs render to the same `#mainContent` div. Switching sections calls `renderCurrentView()`, which branches on `currentSection` and `currentView`:

```
Daily + week   → renderWeekView()
Daily + day    → renderDayView()
Ideas          → renderListView()  (category: ideas)
Projects       → renderListView()  (category: tasks)
Someday        → renderListView()  (category: other)
```

All rendering is **innerHTML assignment** — no virtual DOM, no diffing. The entire view re-renders on every state change.

### 4.6 Week View
- 7-column CSS Grid, one column per day (Mon–Sun)
- Calls `getWeekDates(offset)` to compute dates for the visible week
- Each column is clickable → `enterDay(date)` switches to Day View
- A quick-add input at the top creates notes scheduled to today
- Week navigation (`changeWeek(±1)`) adjusts `currentWeekOffset`
- "Plan Week" banner appears on Sundays after 4pm

### 4.7 Day View
- Shows a **horizontal week strip** (7 days, scrollable on mobile) for quick navigation
- **Carry-forward logic:** On today's view only, undone notes from past scheduled dates are surfaced in a "Ledger of Unfinished Business" section above today's notes
- **Priority filtering:** A/B/C/all/done filter tabs
- **Layout toggle:** Switches between flat list and time-block Planner grid
- **Note input card:** textarea + priority radio group + category select + date picker → POST `/api/notes` → meta saved locally

### 4.8 API Calls

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/me` | Fetch user profile + pro status |
| GET | `/api/notes` | Load all notes for the user |
| POST | `/api/notes` | Create a new note |
| DELETE | `/api/notes/:id` | Delete a note |
| POST | `/api/disconnect-telegram` | Unlink Telegram |
| POST | `/stripe/checkout` | Start Stripe checkout session |

All calls use `apiFetch()`, which injects the Bearer token and handles 401 by clearing storage and showing the login overlay.

### 4.9 Real-time Sync
`startLiveSync()` polls `/api/notes` every **3 seconds**. If the response differs from `notesCache` (via JSON string comparison), it updates the cache and calls `renderCurrentView()`. This provides rudimentary multi-tab sync.

### 4.10 Free Tier Cap
- `FREE_LIMIT = 30` notes
- `isPro` is fetched from `/api/me` on init
- `isAtLimit()` returns true when `!isPro && notesCache.length >= 30`
- Hitting the cap opens the upgrade modal instead of creating a note

### 4.11 Upgrade Modal
- Triggered by `openUpgradeModal(capHit)` — `capHit=true` shows a custom InkThorn quote about the limit
- `startCheckout()` calls POST `/stripe/checkout` and redirects to Stripe
- After successful payment, Stripe redirects to `notes.html?upgraded=1`, which triggers a success toast

---

## 5. `daycycle.html` — AI Day Cycle

### 5.1 Purpose
A personalized AI-generated daily schedule rendered as a horizontal scrollable timeline. Claude generates the cycle based on the user's profile (city, neighborhood, projects, interests, partner, vibe words) and caches it in Supabase for the day.

### 5.2 Visual Design
- **Aesthetic:** Miami Synthwave — deep black/charcoal, amber (`#c8832a`) and cyan (`#00d4ff`) accents, scanline overlay, CSS grid pattern
- **Fonts:** Bebas Neue (brand/headings), Space Grotesk (UI), DM Sans (fallback)
- Designed for both desktop and mobile; collapses to a single-column layout on screens ≤600px

### 5.3 Data Flow

```
1. On load → read localStorage for token → redirect to notes.html if absent
2. GET /api/profile → check onboarding_complete → redirect to onboarding.html if false
3. GET /api/cycle → Worker checks Supabase for today's cached cycle
   ├── Cache hit → returns stored JSON immediately
   └── Cache miss → Worker calls Claude, fetches Google Places + Bandsintown,
                    builds cycle JSON, stores in Supabase, returns it
4. renderCycle(data, profile, places) → paints the full UI
```

### 5.4 Cycle JSON Structure

The `/api/cycle` response is a JSON object with the following shape:

```json
{
  "blocks": [
    {
      "time": "6:00 AM",
      "icon": "🌅",
      "label": "Wake Up",
      "tips": ["First tip line", "Second tip line (cyan)"],
      "recommendation": {
        "name": "Venue Name",
        "address": "123 Magazine St",
        "note": "Why this spot is relevant today",
        "url": "https://..."
      }
    }
  ],
  "concierge": {
    "title": "Monday Anchor — TextOS & Reyla",
    "notes": ["Note 1", "Note 2", "Note 3"]
  },
  "private": ["Private note for partner"],
  "_city": "New Orleans",
  "_neighborhood": "Uptown",
  "_lat": 29.9245,
  "_lng": -90.1133,
  "_places": [ /* Google Places results array */ ]
}
```

- `blocks[]` — the main timeline cards
- `concierge` — identity-anchored daily notes (business, priorities, personal)
- `private[]` — blur-redacted panel, reveal on tap, auto-reblurs after 15s
- `_*` fields — metadata injected by the Worker for the frontend to use (not rendered directly)

### 5.5 Timeline Rendering

Each block in `blocks[]` is rendered by `renderBlock(b)`:
- Block status is computed by `getBlockStatus(b.time)`: `current` (within 35 min of now), `past`, or future
- **Current block:** amber glow, lifted, pulsing dot indicator, `NOW` badge
- **Past blocks:** 35% opacity
- The timeline auto-scrolls to the current (or next upcoming) block on load, with three deferred scroll attempts (50ms / 300ms / 800ms) to handle layout paint timing
- A 60-second interval re-renders the track to update current/past state as time progresses

### 5.6 View Tabs

Four day-type tabs share the same timeline container (`#dc-track`):

| Tab | Data Source |
|---|---|
| ✦ Concierge | AI-generated, fetched from `/api/cycle`, cached in Supabase |
| Weekday | Static hardcoded array `DAY_DATA.weekday` (22 blocks) |
| Weekend | Static hardcoded array `DAY_DATA.weekend` (14 blocks) |
| Vacation | Static hardcoded array `DAY_DATA.vacation` (10 blocks) |

On mobile, the day-type button row is hidden and replaced by a hamburger menu (`☰`) that opens a bottom sheet picker (`#view-overlay`).

### 5.7 Week Strip

A 7-day strip (Mon–Sun) sits above the timeline. It is:
- Rendered immediately on page load (before the API calls resolve)
- Navigable via "← Week" / "Week →" buttons (`_weekOffset` state variable)
- Clicking a day that is **today** → calls `showConcierge()` to load the AI view
- Clicking a **past or future day** → calls `showDayType('weekday' | 'weekend')` with the static data (AI cycle is only generated for today)

Date arithmetic uses local date parts directly (year/month/day extraction) to avoid UTC timezone shift bugs.

### 5.8 Neighborhood Bar

Below the timeline, a neighborhood map + venue strip renders using:
- **Google Maps embed** — `iframe` pointing to the user's neighborhood as a query
- **Google Places results** from `data._places[]` — deduplicated by name, rendered as tappable cards that open Google Maps search
- Falls back to a single "Explore Nearby" placeholder if the Worker returned no places

### 5.9 Private Panel

The `private[]` array from the cycle JSON renders as a blur-redacted card:
- Default state: `filter: blur(8px)`
- Tap header → `togglePrivate()` → `filter: none`
- Auto-reblurs after **15 seconds** via `setTimeout`
- Clicking the content area also triggers toggle
- Intended for partner/relationship nudges generated by Claude

### 5.10 User Menu (Mobile)

Tapping the avatar opens `#user-menu-overlay` — a slide-in sheet with:
- User name + avatar
- Links to Notes and Edit Profile (onboarding)
- Sign out

---

## 6. Shared Patterns

### 6.1 Error Handling
- `apiFetch()` handles 401 → clear token → show login overlay
- API errors surface as console logs; the UI degrades gracefully (empty state shown)
- Cycle fetch failure shows a retry link inside `#cycle-container`

### 6.2 Animations
All animations are CSS keyframes: `slideInTop`, `slideInDown`, `slideUp`, `fadeIn`, `spin`, `pulse-dot`, `blink-badge`. No animation library is used.

### 6.3 Mobile Responsiveness
Both pages use CSS media queries at `max-width: 700px` (notes) and `max-width: 600px` (daycycle). Notes collapses the week grid to 2 columns; daycycle hides the desktop nav links and shows the hamburger menu.

### 6.4 No Framework Policy
Both pages are intentionally framework-free. State mutations trigger explicit re-render calls. This keeps the bundle size at zero and keeps the architecture legible to any developer without toolchain setup.

---

## 7. Key Files & Paths

| File | Path | Purpose |
|---|---|---|
| `notes.html` | `/inkthorn-dashboard/notes.html` | Auth entry + note management app |
| `daycycle.html` | `/inkthorn-dashboard/daycycle.html` | AI day cycle product |
| `onboarding.html` | `/inkthorn-dashboard/onboarding.html` | 6-screen identity wizard (profile setup) |
| `inkthorn-mascot.png` | `/inkthorn-dashboard/inkthorn-mascot.png` | Brand character image |
| Worker source | `/inkthorn/worker/index.js` | Cloudflare Worker — auth, API, Claude calls |

---

## 8. Worker API (Reference)

The Worker (`inkthorn-notes.rgaudet2023.workers.dev`) handles:

| Route | Description |
|---|---|
| `GET /auth/google` | Initiates Google OAuth flow |
| `GET /auth/callback` | OAuth callback — issues JWT, redirects |
| `GET /api/me` | Returns user profile + `is_pro` flag |
| `GET /api/profile` | Returns onboarding profile (identity context for Claude) |
| `POST /api/profile` | Saves onboarding data to Supabase `profiles` table |
| `GET /api/cycle` | Returns cached or freshly generated day cycle |
| `GET /api/notes` | Returns all notes for the authenticated user |
| `POST /api/notes` | Creates a new note |
| `DELETE /api/notes/:id` | Deletes a note |
| `POST /stripe/checkout` | Creates Stripe checkout session |

---

## 9. Supabase Schema (Summary)

| Table | Key Columns |
|---|---|
| `profiles` | `user_id`, `city`, `neighborhood`, `lat`, `lng`, `vibe_words`, `projects`, `partner`, `onboarding_complete` |
| `day_cycles` | `user_id`, `date`, `cycle_json` (cached Claude output) |
| `subscriptions` | `user_id`, `plan`, `expires_at` |

Notes are stored in a `notes` table (not listed here; managed entirely by the Worker).

---

## 10. Known Limitations & Future Work

| Area | Issue / Note |
|---|---|
| Local meta | Priority, done state, scheduled date are localStorage-only — not synced across devices |
| Day cycle caching | One AI cycle per user per day; switching tabs on past dates falls back to static data |
| Supabase RLS | Row-level security was disabled on `profiles` table to unblock onboarding saves — re-enable before multi-tenant production |
| Bandsintown | `BANDSINTOWN_APP_ID` worker secret not yet added — live events not currently surfaced |
| Custom domain | `api.inkthorn.ai` → Worker mapping not yet configured; Worker is accessed via `.workers.dev` URL |
| Pro billing | Stripe recurring price ID for new subscribers not yet created; existing pro users manually inserted |
