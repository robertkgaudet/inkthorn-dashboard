#!/usr/bin/env node
/**
 * scrape-wwoz.js — InkThorn WWOZ Livewire Scraper
 *
 * Fetches https://wwoz.org/calendar/livewire-music and parses venue/artist/time
 * data, then writes data/live-music.json relative to this script's location.
 *
 * Usage:
 *   node scripts/scrape-wwoz.js
 *   node scripts/scrape-wwoz.js --date 2026-03-20
 */

'use strict';

const https = require('https');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');
const url   = require('url');

// ── Config ─────────────────────────────────────────────────────

const OUTPUT_PATH = path.join(__dirname, '../data/live-music.json');
const BASE_URL    = 'https://wwoz.org/calendar/livewire-music';

// ── CLI Args ───────────────────────────────────────────────────

const args = process.argv.slice(2);
let targetDate = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) {
    targetDate = args[i + 1];
    i++;
  }
}

if (!targetDate) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  targetDate = `${y}-${m}-${d}`;
}

const [year, month, day] = targetDate.split('-').map(Number);
const dateObj = new Date(year, month - 1, day);
const dateLabel = dateObj.toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

console.log(`[WWOZ Scraper] Target date: ${targetDate} (${dateLabel})`);

// ── Genre Keyword Map ──────────────────────────────────────────

// Order matters: more specific patterns first
const GENRE_KEYWORDS = [
  // Specific artist/keyword patterns
  { pattern: /brass band/i,                    genre: 'Brass' },
  { pattern: /\bbrass\b/i,                     genre: 'Brass' },
  { pattern: /kermit ruffins/i,                genre: 'Jazz' },
  { pattern: /\bDJ\s/i,                        genre: 'Electronic' },
  { pattern: /\bindustrial\b/i,                genre: 'Electronic' },
  { pattern: /\btechno\b/i,                    genre: 'Electronic' },
  { pattern: /\belectro/i,                     genre: 'Electronic' },
  { pattern: /\bsynth/i,                       genre: 'Electronic' },
  { pattern: /zydeco/i,                        genre: 'Zydeco' },
  { pattern: /creole cooking/i,                genre: 'Cajun' },
  { pattern: /\bcajun\b/i,                     genre: 'Cajun' },
  { pattern: /\bcreole\b/i,                    genre: 'Cajun' },
  { pattern: /\bfunk(box|y|tion)?\b/i,         genre: 'Funk' },
  { pattern: /funkbox/i,                       genre: 'Funk' },
  { pattern: /\bfunk\b/i,                      genre: 'Funk' },
  { pattern: /\breggae\b/i,                    genre: 'Reggae' },
  { pattern: /higher heights/i,                genre: 'Reggae' },
  { pattern: /\bsoul\b/i,                      genre: 'Soul' },
  { pattern: /\br&b\b/i,                       genre: 'R&B' },
  { pattern: /\brhythm.and.blues\b/i,          genre: 'R&B' },
  { pattern: /\bblues\b/i,                     genre: 'Blues' },
  { pattern: /\brock\b/i,                      genre: 'Rock' },
  { pattern: /\bworld\b/i,                     genre: 'World' },
  { pattern: /brasino[la]/i,                   genre: 'World' },
  { pattern: /\bjazz\b/i,                      genre: 'Jazz' },
  { pattern: /\bswing\b/i,                     genre: 'Jazz' },
  { pattern: /\bbebop\b/i,                     genre: 'Jazz' },
  { pattern: /\btrio\b/i,                      genre: 'Jazz' },
  { pattern: /\bquartet\b/i,                   genre: 'Jazz' },
  { pattern: /\bquintet\b/i,                   genre: 'Jazz' },
  { pattern: /\borchestra\b/i,                 genre: 'Jazz' },
  { pattern: /\bsinger.songwriter\b/i,         genre: 'Singer-Songwriter' },
  { pattern: /\bacoustic\b/i,                  genre: 'Singer-Songwriter' },
  { pattern: /open mic/i,                      genre: 'Other' },
];

/**
 * Guess genre from artist/venue name using keyword map.
 * @param {string} text
 * @returns {string}
 */
function guessGenre(text) {
  for (const { pattern, genre } of GENRE_KEYWORDS) {
    if (pattern.test(text)) return genre;
  }
  return 'Other';
}

// ── Time Parsing ───────────────────────────────────────────────

/**
 * Parse a time string like "9:00pm" or "10:30 AM" into
 * { display: "9:00pm", sort: 2100 }
 */
function parseTime(raw) {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!m) return null;
  let hours   = parseInt(m[1], 10);
  const mins  = parseInt(m[2] || '0', 10);
  const ampm  = m[3].toLowerCase();
  if (ampm === 'pm' && hours !== 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;
  const sort = hours * 100 + mins;
  const displayHour = hours % 12 || 12;
  const displayMins = mins > 0 ? `:${String(mins).padStart(2, '0')}` : ':00';
  const display = `${displayHour}${displayMins}${ampm}`;
  return { display, sort };
}

// ── HTTP Fetch ─────────────────────────────────────────────────

/**
 * Fetch a URL, following redirects, returning body as string.
 */
function fetchUrl(rawUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects'));
      return;
    }

    const parsed  = new URL(rawUrl);
    const driver  = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers: {
        'User-Agent': 'InkThorn-Agent/1.0 (+https://github.com/inkthorn)',
        'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    };

    const req = driver.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = url.resolve(rawUrl, res.headers.location);
        console.log(`[WWOZ Scraper] Redirect ${res.statusCode} → ${redirectUrl}`);
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
      res.on('data', chunk => chunks.push(chunk));
      res.on('end',  () => resolve(chunks.join('')));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout after 15s'));
    });
    req.end();
  });
}

// ── HTML Parser ────────────────────────────────────────────────

/**
 * Naïve but practical HTML parser for WWOZ livewire structure.
 * WWOZ livewire page structure (simplified):
 *
 * <h3 class="...">Venue Name</h3>
 * <div class="livewire-listing">
 *   <div class="field-items">
 *     <div class="field-item">
 *       <span class="date-display-single">9:00pm</span>
 *       <span class="field-content">Artist Name</span>
 *     </div>
 *   </div>
 * </div>
 *
 * We extract text from tags using regex (no DOM parser needed).
 */

function stripTags(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Parse WWOZ livewire HTML and extract shows.
 * Returns array of { venue, artist, time, time_sort, genre }
 */
function parseWwozHtml(html) {
  const shows = [];

  // Find the main livewire content area
  const contentMatch = html.match(/<div[^>]+class="[^"]*livewire[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]+class="[^"]*view-footer)/i);
  const content = contentMatch ? contentMatch[1] : html;

  // Split on venue headers (h3 tags)
  // WWOZ uses h3 for venue names in the livewire listing
  const venueBlocks = content.split(/<h3[^>]*>/i).slice(1);

  for (const block of venueBlocks) {
    // Extract venue name (text before </h3>)
    const venueMatch = block.match(/^([^<]*)<\/h3>/i);
    if (!venueMatch) continue;
    const venue = decodeEntities(venueMatch[1].trim());
    if (!venue) continue;

    // Find all listing rows in this block
    // Each row typically has a time and an artist
    const rowPattern = /<div[^>]+class="[^"]*views-row[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*views-row|<h3|$)/gi;
    let rowMatch;

    while ((rowMatch = rowPattern.exec(block)) !== null) {
      const row = rowMatch[1];

      // Extract time — look for common time patterns
      const timePatterns = [
        /(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
        /(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/,
      ];

      let rawTime = null;
      for (const tp of timePatterns) {
        const tm = row.match(tp);
        if (tm) { rawTime = tm[1]; break; }
      }

      // Extract artist — strip all tags, decode entities
      const artistRaw = stripTags(row);
      // Remove time portion from artist string
      const artistClean = decodeEntities(
        artistRaw.replace(/\d{1,2}(?::\d{2})?\s*(?:am|pm)/gi, '').trim()
      );

      if (!artistClean || artistClean.length < 2) continue;

      const parsed = rawTime ? parseTime(rawTime) : null;

      shows.push({
        time:      parsed ? parsed.display : (rawTime || 'TBD'),
        time_sort: parsed ? parsed.sort : 0,
        artist:    artistClean,
        venue,
        genre:     guessGenre(artistClean + ' ' + venue),
        neighborhood: guessNeighborhood(venue),
      });
    }
  }

  // If the structured parse found nothing, try a simpler pattern:
  if (shows.length === 0) {
    console.warn('[WWOZ Scraper] Structured parse found 0 shows; trying fallback pattern...');
    const fallbackVenuePattern = /<h3[^>]*>([^<]+)<\/h3>/gi;
    let vm;
    while ((vm = fallbackVenuePattern.exec(html)) !== null) {
      const venue = decodeEntities(vm[1].trim());
      // Look ahead for time + artist pairs within next 2000 chars
      const lookahead = html.slice(vm.index, vm.index + 2000);
      const timeArtistPattern = /(\d{1,2}(?::\d{2})?\s*(?:am|pm))[^<]*<[^>]+>([^<]{3,80})</gi;
      let tam;
      while ((tam = timeArtistPattern.exec(lookahead)) !== null) {
        const parsed = parseTime(tam[1]);
        const artist = decodeEntities(tam[2].trim());
        if (!artist) continue;
        shows.push({
          time:         parsed ? parsed.display : tam[1],
          time_sort:    parsed ? parsed.sort : 0,
          artist,
          venue,
          genre:        guessGenre(artist + ' ' + venue),
          neighborhood: guessNeighborhood(venue),
        });
      }
    }
  }

  return shows;
}

// ── Neighborhood Guesser ───────────────────────────────────────

const NEIGHBORHOOD_MAP = {
  'fritzel':          'French Quarter',
  'carousel bar':     'French Quarter',
  'hotel monteleone': 'French Quarter',
  'bourbon o bar':    'French Quarter',
  'davenport':        'French Quarter',
  'royal street':     'French Quarter',
  "bamboula's":       'French Quarter',
  'crypt':            'French Quarter',
  '21st amendment':   'Central Business District',
  'double dealer':    'Central Business District',
  'orpheum':          'Central Business District',
  'flora gallery':    'Central Business District',
  'blue nile':        'Marigny',
  "d.b.a.":           'Marigny',
  "buffa's":          'Marigny',
  'apple barrel':     'Marigny',
  'café negril':      'Marigny',
  'cafe negril':      'Marigny',
  'domino':           'Marigny',
  'bacchanal':        'Bywater',
  "bj's lounge":      'Bywater',
  'bratz':            'Bywater',
  '30/90':            'Mid-City',
  'broadside':        'Mid-City',
  'chickie wah wah':  'Mid-City',
  'carrollton station': 'Carrollton',
  'alliance française': 'Uptown',
  'alliance francaise': 'Uptown',
  'bmc':              'Uptown',
  'dos jefes':        'Uptown',
  'gasa gasa':        'Uptown',
  'brothers three':   'Uptown',
  'bayou bar':        'Garden District',
  'pontchartrain':    'Garden District',
};

function guessNeighborhood(venue) {
  const lower = venue.toLowerCase();
  for (const [keyword, hood] of Object.entries(NEIGHBORHOOD_MAP)) {
    if (lower.includes(keyword)) return hood;
  }
  return null;
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const fetchUrl_ = `${BASE_URL}?date=${targetDate}`;
  console.log(`[WWOZ Scraper] Fetching: ${fetchUrl_}`);

  let html;
  try {
    html = await fetchUrl(fetchUrl_);
    console.log(`[WWOZ Scraper] Fetched ${html.length.toLocaleString()} bytes`);
  } catch (err) {
    console.error(`[WWOZ Scraper] ❌ Fetch failed: ${err.message}`);
    process.exit(1);
  }

  let shows;
  try {
    shows = parseWwozHtml(html);
    console.log(`[WWOZ Scraper] Parsed ${shows.length} show(s)`);
  } catch (err) {
    console.error(`[WWOZ Scraper] ❌ Parse failed: ${err.message}`);
    process.exit(1);
  }

  if (!shows.length) {
    console.warn('[WWOZ Scraper] ⚠️  No shows found — check HTML structure');
  }

  // Sort by time_sort, with post-midnight times (0–599) sorted last
  shows.sort((a, b) => {
    const norm = t => (t < 600 ? t + 2400 : t);
    return norm(a.time_sort) - norm(b.time_sort);
  });

  const output = {
    agent:   'Rob-Agent',
    updated: new Date().toISOString(),
    source:  'WWOZ Livewire',
    date:    dateLabel,
    shows,
  };

  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  try {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
    console.log(`[WWOZ Scraper] ✅ Wrote ${shows.length} shows to ${OUTPUT_PATH}`);
  } catch (err) {
    console.error(`[WWOZ Scraper] ❌ Write failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`[WWOZ Scraper] Fatal: ${err.message}`);
  process.exit(1);
});
