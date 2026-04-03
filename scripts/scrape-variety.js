#!/usr/bin/env node
/**
 * scrape-variety.js — InkThorn New Orleans Variety/Burlesque Scraper
 *
 * Scrapes Eventbrite for New Orleans burlesque, cabaret, drag, and variety
 * events. Deduplicates against existing live-music.json by venue+time.
 * Writes data/variety.json relative to this script's location.
 *
 * Sources:
 *   - Eventbrite: burlesque, cabaret, variety, drag categories
 *
 * Usage:
 *   node scripts/scrape-variety.js
 */

'use strict';

const https = require('https');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');
const url   = require('url');

const OUTPUT_PATH    = path.join(__dirname, '../data/variety.json');
const LIVE_MUSIC_PATH = path.join(__dirname, '../data/live-music.json');

// ── Eventbrite search URLs ─────────────────────────────────────
// Multiple search terms to cast a wide net; we dedup after

const SEARCH_URLS = [
  'https://www.eventbrite.com/d/la--new-orleans/burlesque--cabaret--variety/',
  'https://www.eventbrite.com/d/la--new-orleans/drag-show/',
  'https://www.eventbrite.com/d/la--new-orleans/burlesque/',
];

// ── HTTP Fetch ─────────────────────────────────────────────────

function fetchUrl(rawUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) { reject(new Error('Too many redirects')); return; }

    const parsed  = new URL(rawUrl);
    const driver  = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InkThorn-Agent/1.0; +https://inkthorn.ai)',
        'Accept':     'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    };

    const req = driver.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = url.resolve(rawUrl, res.headers.location);
        console.log(`[Variety] Redirect ${res.statusCode} → ${redirectUrl}`);
        resolve(fetchUrl(redirectUrl, redirectCount + 1));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${rawUrl}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.setEncoding('utf8');
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(chunks.join('')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ── Helpers ────────────────────────────────────────────────────

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'").replace(/&rdquo;/g, '"').replace(/&ldquo;/g, '"')
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Date Parsing ───────────────────────────────────────────────

const MONTHS = {
  jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
  jul:7, aug:8, sep:9, oct:10, nov:11, dec:12
};

/**
 * Parse Eventbrite date strings like:
 *   "Fri, Apr 24, 9:00 PM"
 *   "Tomorrow at 6:00 PM"
 *   "Sat, Apr 25, 10:30 PM"
 * Returns { isoDate, time, time_sort, dayLabel }
 */
function parseEventbriteDate(raw) {
  if (!raw) return null;
  raw = raw.replace(/\s+/g, ' ').trim();

  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();

  // "Tomorrow at 6:00 PM"
  if (/tomorrow/i.test(raw)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const timeMatch = raw.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
    const { time, time_sort } = timeMatch ? parseTime(timeMatch[1]) : { time: 'TBD', time_sort: 0 };
    return {
      isoDate: tomorrow.toISOString().slice(0,10),
      dayLabel: 'Tomorrow',
      time,
      time_sort,
    };
  }

  // "Today at 6:00 PM"
  if (/today/i.test(raw)) {
    const timeMatch = raw.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
    const { time, time_sort } = timeMatch ? parseTime(timeMatch[1]) : { time: 'TBD', time_sort: 0 };
    return {
      isoDate: `${todayY}-${String(todayM).padStart(2,'0')}-${String(todayD).padStart(2,'0')}`,
      dayLabel: 'Today',
      time,
      time_sort,
    };
  }

  // "Fri, Apr 24, 9:00 PM" or "Sat, Apr 25, 10:30 PM"
  const fullMatch = raw.match(/([A-Za-z]+),\s*([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (fullMatch) {
    const monthStr = fullMatch[2].toLowerCase().slice(0, 3);
    const month    = MONTHS[monthStr];
    const day      = parseInt(fullMatch[3], 10);
    let year       = todayY;
    // If the month/day is already past, assume next year
    if (month < todayM || (month === todayM && day < todayD)) year++;
    const isoDate  = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const { time, time_sort } = parseTime(fullMatch[4]);
    const dateObj  = new Date(year, month - 1, day);
    const dayLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return { isoDate, dayLabel, time, time_sort };
  }

  // "Apr 24 · 9:00 PM" style
  const shortMatch = raw.match(/([A-Za-z]+)\s+(\d{1,2})\s*[·•]\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (shortMatch) {
    const monthStr = shortMatch[1].toLowerCase().slice(0, 3);
    const month    = MONTHS[monthStr];
    const day      = parseInt(shortMatch[2], 10);
    let year       = todayY;
    if (month < todayM || (month === todayM && day < todayD)) year++;
    const isoDate  = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const { time, time_sort } = parseTime(shortMatch[3]);
    const dateObj  = new Date(year, month - 1, day);
    const dayLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return { isoDate, dayLabel, time, time_sort };
  }

  return null;
}

function parseTime(raw) {
  if (!raw) return { time: 'TBD', time_sort: 0 };
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return { time: raw, time_sort: 0 };
  let h  = parseInt(m[1], 10);
  const mn = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  const time_sort = h * 100 + mn;
  const displayH  = h % 12 || 12;
  const displayM  = mn > 0 ? `:${String(mn).padStart(2,'0')}` : ':00';
  const displayAP = ap.toLowerCase();
  return { time: `${displayH}${displayM}${displayAP}`, time_sort };
}

// ── Classify variety subtype ───────────────────────────────────

function classifySubtype(title) {
  const t = title.toLowerCase();
  if (/burlesque/i.test(t))          return 'Burlesque';
  if (/drag/i.test(t))               return 'Drag';
  if (/cabaret/i.test(t))            return 'Cabaret';
  if (/variety/i.test(t))            return 'Variety';
  if (/comedy/i.test(t))             return 'Comedy';
  if (/magic/i.test(t))              return 'Magic';
  if (/circus|acrobat/i.test(t))     return 'Circus';
  if (/storytell/i.test(t))          return 'Storytelling';
  if (/open mic/i.test(t))           return 'Open Mic';
  return 'Variety';
}

// ── Parse Eventbrite HTML ──────────────────────────────────────

/**
 * Eventbrite search results embed structured data in JSON-LD script tags as
 * an itemList. Each item has startDate (date only, not time), url, location,
 * name, description. Time is not in the JSON-LD so we default to TBD.
 *
 * JSON-LD structure:
 * {
 *   "@context": "https://schema.org",
 *   "itemListElement": [
 *     {
 *       "position": 1,
 *       "@type": "ListItem",
 *       "item": {
 *         "startDate": "2026-04-24",
 *         "url": "https://www.eventbrite.com/e/...",
 *         "name": "Event Title",   // NOT always present — may be in description
 *         "location": { "name": "Venue", "address": {...} }
 *       }
 *     }
 *   ]
 * }
 */
function parseEventbriteHtml(html, sourceUrl) {
  const events = [];

  const jsonLdRe = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jm;
  while ((jm = jsonLdRe.exec(html)) !== null) {
    let obj;
    try { obj = JSON.parse(jm[1]); } catch (e) { continue; }

    // Handle itemList format (Eventbrite search results)
    if (obj.itemListElement && Array.isArray(obj.itemListElement)) {
      for (const listItem of obj.itemListElement) {
        const item = listItem.item || listItem;
        if (!item) continue;

        const eventUrl   = item.url || '';
        const startRaw   = item.startDate || '';
        const location   = item.location || {};
        const venue      = decodeEntities((location.name || '')).trim() || 'New Orleans';
        const desc       = item.description || '';

        // Name: try item.name, fallback to extracting from URL slug
        let name = decodeEntities((item.name || '')).trim();
        if (!name && eventUrl) {
          const slugMatch = eventUrl.match(/\/e\/([^-].*?)-tickets-/);
          if (slugMatch) {
            name = slugMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          }
        }
        if (!name) continue;

        // Parse date
        let isoDate = '', dayLabel = 'Upcoming';
        if (startRaw) {
          const datePart = startRaw.slice(0, 10); // "2026-04-24"
          const [y, mo, d] = datePart.split('-').map(Number);
          if (y && mo && d) {
            isoDate = datePart;
            const dateObj = new Date(y, mo - 1, d);
            const today   = new Date();
            today.setHours(0,0,0,0);
            const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
            if (dateObj.getTime() === today.getTime()) {
              dayLabel = 'Today';
            } else if (dateObj.getTime() === tomorrow.getTime()) {
              dayLabel = 'Tomorrow';
            } else {
              dayLabel = dateObj.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
              });
            }
          }
        }

        events.push({
          title:     name,
          url:       eventUrl.split('?')[0],
          venue,
          isoDate,
          dayLabel,
          time:      'See listing',
          time_sort: 2000, // default evening
          subtype:   classifySubtype(name + ' ' + desc),
          cost:      null,
          source:    'Eventbrite',
          description: desc.slice(0, 160) || null,
        });
      }
    }

    // Handle single Event type
    if (obj['@type'] === 'Event' || (Array.isArray(obj['@type']) && obj['@type'].includes('Event'))) {
      const name     = decodeEntities(obj.name || '');
      const eventUrl = obj.url || '';
      const location = obj.location || {};
      const venue    = decodeEntities((location.name || '')).trim() || 'New Orleans';
      const startRaw = obj.startDate || '';
      let isoDate = '', time = 'See listing', time_sort = 2000, dayLabel = 'Upcoming';
      if (startRaw) {
        isoDate = startRaw.slice(0, 10);
        if (startRaw.length > 10) {
          // Has time component: "2026-04-24T21:00:00"
          const dt = new Date(startRaw);
          if (!isNaN(dt)) {
            const h = dt.getHours(), mn = dt.getMinutes();
            const ap = h >= 12 ? 'pm' : 'am';
            const displayH = h % 12 || 12;
            const displayM = mn > 0 ? `:${String(mn).padStart(2,'0')}` : ':00';
            time = `${displayH}${displayM}${ap}`;
            time_sort = h * 100 + mn;
          }
        }
        const [y, mo, d] = isoDate.split('-').map(Number);
        if (y && mo && d) {
          const dateObj = new Date(y, mo - 1, d);
          dayLabel = dateObj.toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
          });
        }
      }
      if (!name || !isoDate) continue;
      events.push({
        title: name,
        url: eventUrl.split('?')[0],
        venue,
        isoDate,
        dayLabel,
        time,
        time_sort,
        subtype: classifySubtype(name),
        cost: null,
        source: 'Eventbrite',
        description: decodeEntities(obj.description || '').slice(0, 160) || null,
      });
    }
  }

  console.log(`[Variety] JSON-LD parse: ${events.length} event(s) from ${sourceUrl}`);
  return events;
}

// ── Deduplication ──────────────────────────────────────────────

/**
 * Normalize a string for dedup comparison (lowercase, strip punctuation/spaces).
 */
function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Build a dedup key set from existing live-music.json shows.
 * Key: normalized(venue) + normalized(time)
 */
function buildExistingKeys() {
  const keys = new Set();
  try {
    const data = JSON.parse(fs.readFileSync(LIVE_MUSIC_PATH, 'utf8'));
    for (const show of (data.shows || [])) {
      keys.add(normalize(show.venue) + '|' + normalize(show.time));
    }
  } catch (e) { /* live-music.json may not exist yet */ }
  return keys;
}

/**
 * Dedup an array of events both against each other and against existing shows.
 */
function deduplicateEvents(events, existingKeys) {
  const seen = new Set();
  const result = [];
  for (const ev of events) {
    // Dedup against live-music.json
    const musicKey = normalize(ev.venue) + '|' + normalize(ev.time);
    if (existingKeys.has(musicKey)) {
      console.log(`[Variety] Skipping duplicate of live-music show: "${ev.title}" @ ${ev.venue}`);
      continue;
    }
    // Dedup within variety list (by URL, or title+date)
    const selfKey = ev.url
      ? ev.url
      : normalize(ev.title) + '|' + (ev.isoDate || '') + '|' + normalize(ev.venue);
    if (seen.has(selfKey)) continue;
    seen.add(selfKey);
    result.push(ev);
  }
  return result;
}

// ── Today-first sort ───────────────────────────────────────────

function dayOrder(isoDate) {
  if (!isoDate) return 9999;
  const today = new Date().toISOString().slice(0, 10);
  if (isoDate === today) return 0;
  return isoDate > today ? 1 : 2; // future events before old
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('[Variety] Starting New Orleans variety/burlesque scraper…');

  const existingKeys = buildExistingKeys();
  console.log(`[Variety] Loaded ${existingKeys.size} existing live-music keys for dedup`);

  let allEvents = [];

  for (const searchUrl of SEARCH_URLS) {
    console.log(`[Variety] Fetching: ${searchUrl}`);
    let html;
    try {
      html = await fetchUrl(searchUrl);
      console.log(`[Variety] Fetched ${html.length.toLocaleString()} bytes`);
    } catch (err) {
      console.warn(`[Variety] ⚠️  Fetch failed for ${searchUrl}: ${err.message}`);
      continue;
    }

    const events = parseEventbriteHtml(html, searchUrl);
    allEvents = allEvents.concat(events);

    // Small delay between requests — be polite
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`[Variety] Total events before dedup: ${allEvents.length}`);

  // Dedup
  const unique = deduplicateEvents(allEvents, existingKeys);
  console.log(`[Variety] After dedup: ${unique.length} events`);

  // Sort: today first, then upcoming chronologically
  unique.sort((a, b) => {
    const da = dayOrder(a.isoDate);
    const db = dayOrder(b.isoDate);
    if (da !== db) return da - db;
    if (a.isoDate !== b.isoDate) return a.isoDate < b.isoDate ? -1 : 1;
    const norm = t => (t < 600 ? t + 2400 : t);
    return norm(a.time_sort) - norm(b.time_sort);
  });

  // Group by date
  const dayMap = new Map();
  for (const ev of unique) {
    const key = ev.isoDate || 'unknown';
    if (!dayMap.has(key)) dayMap.set(key, { date: ev.isoDate, label: ev.dayLabel, events: [] });
    dayMap.get(key).events.push(ev);
  }

  const output = {
    agent:   'Rob-Agent',
    updated: new Date().toISOString(),
    source:  'Eventbrite',
    days:    [...dayMap.values()],
    shows:   unique,
  };

  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
    console.log(`[Variety] ✅ Wrote ${unique.length} events to ${OUTPUT_PATH}`);
  } catch (err) {
    console.error(`[Variety] ❌ Write failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`[Variety] Fatal: ${err.message}`);
  process.exit(1);
});
