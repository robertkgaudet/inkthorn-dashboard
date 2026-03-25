#!/usr/bin/env node
/**
 * scrape-504comedy.js — InkThorn 504Comedy Scraper
 *
 * Fetches https://504comedy.com (this week's events) and parses
 * show name, time, venue, type (Stand-up, Open Mic, etc.), and cost.
 * Writes data/comedy.json relative to this script's location.
 *
 * Usage:
 *   node scripts/scrape-504comedy.js
 */

'use strict';

const https = require('https');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');
const url   = require('url');

const OUTPUT_PATH = path.join(__dirname, '../data/comedy.json');
const SOURCE_URL  = 'https://504comedy.com';

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
        'User-Agent': 'InkThorn-Agent/1.0 (+https://github.com/inkthorn)',
        'Accept':     'text/html,application/xhtml+xml,*/*;q=0.8',
      },
    };

    const req = driver.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = url.resolve(rawUrl, res.headers.location);
        console.log(`[504Comedy] Redirect ${res.statusCode} → ${redirectUrl}`);
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

function stripTags(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'").replace(/&rdquo;/g, '"').replace(/&ldquo;/g, '"')
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? decodeEntities(m[1]) : null;
}

// ── Parse ──────────────────────────────────────────────────────

/**
 * 504comedy.com page structure (2026):
 *
 * <section class="event-group today"> or <section class="event-group">
 *   <h1><span class="day">Today</span> <span class="date">3.25</span></h1>
 *   <div class="event-group-events">
 *     <div class="event inverted dark" itemscope itemtype="http://schema.org/ComedyEvent">
 *       <meta itemprop="name" content="Show Name">
 *       <meta itemprop="startDate" content="2026-03-25T21:00-05:00">
 *       <div class="event-repeat">Every Wednesday</div>
 *       <div class="event-footer">
 *         <a href="/event/44/slug" class="event-title">Show Name</a>
 *         <div class="event-when">9:00pm @ <span itemprop="name">Venue</span></div>
 *         <div class="type-pill">Open Mic</div>
 *         <div class="event-cost">FREE</div>  (or $10)
 *       </div>
 *     </div>
 *   </div>
 * </section>
 */
function parse504ComedyHtml(html) {
  const events = [];

  // Split into day groups
  const groupPattern = /<section[^>]+class="[^"]*event-group[^"]*"[^>]*>([\s\S]*?)(?=<section[^>]+class="[^"]*event-group|<\/main>|$)/gi;
  let gm;

  while ((gm = groupPattern.exec(html)) !== null) {
    const block = gm[1];

    // Extract day label + date
    const dayMatch  = block.match(/<span[^>]+class="[^"]*day[^"]*"[^>]*>([^<]+)<\/span>/i);
    const dateMatch = block.match(/<span[^>]+class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>/i);
    const dayLabel  = dayMatch  ? decodeEntities(dayMatch[1].trim())  : 'Unknown Day';
    const dateLabel = dateMatch ? decodeEntities(dateMatch[1].trim()) : '';

    // Parse the actual date from the label (e.g. "3.25" → "2026-03-25")
    let isoDate = null;
    if (dateLabel) {
      const parts = dateLabel.split('.');
      if (parts.length === 2) {
        const now = new Date();
        const m = parseInt(parts[0], 10);
        const d = parseInt(parts[1], 10);
        // Use current year; bump year if month is in the past
        let y = now.getFullYear();
        if (m < now.getMonth() + 1 || (m === now.getMonth() + 1 && d < now.getDate())) {
          y++;
        }
        isoDate = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      }
    }

    // Parse individual events — split on the opening <div class="event inverted..."> tag
    // (must start with "event " followed by more classes, NOT "event-cost" or "event-footer")
    const eventDivRe = /<div[^>]+class="event\s+[^"]*"[^>]*itemscope[^>]*>/gi;
    const eventStarts = [];
    let esm;
    while ((esm = eventDivRe.exec(block)) !== null) {
      eventStarts.push(esm.index + esm[0].length);
    }

    for (let si = 0; si < eventStarts.length; si++) {
      const start = eventStarts[si];
      const end   = eventStarts[si + 1] !== undefined ? eventStarts[si + 1] : block.length;
      const entry = block.slice(start, end);

      // Schema.org meta tags — most reliable source
      const nameMatch     = entry.match(/<meta[^>]+itemprop="name"[^>]*>/i);
      const startMatch    = entry.match(/<meta[^>]+itemprop="startDate"[^>]*>/i);

      const title = nameMatch ? decodeEntities(attr(nameMatch[0], 'content') || '') : null;
      const startDate = startMatch ? attr(startMatch[0], 'content') : null;

      // Event URL
      const urlMatch = entry.match(/href="(\/event\/[^"]+)"/i);
      const eventUrl = urlMatch ? 'https://504comedy.com' + urlMatch[1] : null;

      // Venue name — find the itemprop="name" span that's directly inside
      // itemprop="location". We match the first span[itemprop="name"] that follows
      // itemprop="location" in this event block (event-when section).
      let venue = 'Unknown Venue';
      const venueBlockMatch = entry.match(/itemprop="location"[\s\S]*?<span[^>]+itemprop="name"[^>]*>([^<]+)<\/span>/i);
      if (venueBlockMatch) {
        venue = decodeEntities(venueBlockMatch[1].trim());
      }

      // Time from event-when text
      const whenMatch = entry.match(/class="event-when"[^>]*>\s*([\d:]+(?:am|pm))/i);
      const time = whenMatch ? whenMatch[1] : null;

      // Time sort
      let time_sort = 0;
      if (time) {
        const tm = time.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/i);
        if (tm) {
          let h = parseInt(tm[1], 10);
          const mn = parseInt(tm[2] || '0', 10);
          const ap = tm[3].toLowerCase();
          if (ap === 'pm' && h !== 12) h += 12;
          if (ap === 'am' && h === 12) h = 0;
          time_sort = h * 100 + mn;
        }
      }

      // Comedy type (Stand-up, Open Mic, Improv, Sketch, Storytelling)
      const typeMatch = entry.match(/<div[^>]+class="[^"]*type-pill[^"]*"[^>]*>([^<]+)<\/div>/i);
      const comedyType = typeMatch ? decodeEntities(typeMatch[1].trim()) : 'Comedy';

      // Cost — use the itemprop="price" meta content
      let cost = null;
      const priceMetaMatch = entry.match(/<meta[^>]+itemprop="price"[^>]+content="([^"]*)"[^>]*>/i);
      if (priceMetaMatch) {
        const p = priceMetaMatch[1].trim();
        cost = (p === '0' || p === '') ? 'FREE' : '$' + p;
      }

      // Repeat pattern
      const repeatMatch = entry.match(/<div[^>]+class="[^"]*event-repeat[^"]*"[^>]*>([^<]+)<\/div>/i);
      const repeat = repeatMatch ? decodeEntities(repeatMatch[1].trim()) : null;

      if (!title) continue;

      events.push({
        category:   'comedy',
        day:        dayLabel,
        date:       isoDate,
        time:       time || 'TBD',
        time_sort,
        title,
        url:        eventUrl,
        venue,
        type:       comedyType,
        cost:       cost || null,
        repeat:     repeat || null,
        start_dt:   startDate || null,
      });
    } // end for eventStarts
  } // end while groupPattern

  return events;
}

// ── Day grouping ───────────────────────────────────────────────

function groupByDay(events) {
  const days = [];
  const seen = new Map();
  for (const ev of events) {
    const key = ev.day + '|' + (ev.date || '');
    if (!seen.has(key)) {
      seen.set(key, { day: ev.day, date: ev.date, events: [] });
      days.push(seen.get(key));
    }
    seen.get(key).events.push(ev);
  }
  // Sort each day's events by time
  for (const d of days) {
    d.events.sort((a, b) => {
      const norm = t => (t < 600 ? t + 2400 : t);
      return norm(a.time_sort) - norm(b.time_sort);
    });
  }
  return days;
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log(`[504Comedy] Fetching: ${SOURCE_URL}`);

  let html;
  try {
    html = await fetchUrl(SOURCE_URL);
    console.log(`[504Comedy] Fetched ${html.length.toLocaleString()} bytes`);
  } catch (err) {
    console.error(`[504Comedy] ❌ Fetch failed: ${err.message}`);
    process.exit(1);
  }

  let events;
  try {
    events = parse504ComedyHtml(html);
    console.log(`[504Comedy] Parsed ${events.length} event(s)`);
  } catch (err) {
    console.error(`[504Comedy] ❌ Parse failed: ${err.message}`);
    process.exit(1);
  }

  if (!events.length) {
    console.warn('[504Comedy] ⚠️  No events found — check HTML structure');
  }

  const days = groupByDay(events);

  const output = {
    agent:   'Rob-Agent',
    updated: new Date().toISOString(),
    source:  '504Comedy.com',
    shows:   events,
    days,
  };

  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
    console.log(`[504Comedy] ✅ Wrote ${events.length} events to ${OUTPUT_PATH}`);
  } catch (err) {
    console.error(`[504Comedy] ❌ Write failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`[504Comedy] Fatal: ${err.message}`);
  process.exit(1);
});
