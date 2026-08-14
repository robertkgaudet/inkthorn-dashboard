#!/usr/bin/env node
/**
 * scrape-nola-trades.js
 *
 * Scrapes all trades businesses in the greater New Orleans metro area
 * using the Google Places API.
 *
 * Captures: name, address, phone, website, rating, review count, individual
 * reviews, hours, coordinates, Google Maps URL, photos, business status, types.
 *
 * Unlike the leads scraper this does NOT filter by no-website — it collects ALL
 * trades businesses regardless.
 *
 * Usage:
 *   node scripts/scrape-nola-trades.js
 *   node scripts/scrape-nola-trades.js --max 2000
 *   node scripts/scrape-nola-trades.js --category electrician
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Config ───────────────────────────────────────────────────────────────────
const API_KEY    = 'AIzaSyBYZoSeGlLW0jyt8mE_Ii9TtAzZSfT00-0';
const OUT_DIR    = path.join(__dirname, '..', 'data');
const OUT_JSON   = path.join(OUT_DIR, 'nola-trades.json');
const OUT_CSV    = path.join(OUT_DIR, 'nola-trades.csv');

// Same proven coverage grid from leads scraper
const SEARCH_ZONES = [
  { name: 'New Orleans Uptown/Garden District', lat: 29.9245, lng: -90.0893, radius: 6000 },
  { name: 'New Orleans CBD/French Quarter',     lat: 29.9566, lng: -90.0680, radius: 5000 },
  { name: 'New Orleans Mid-City',               lat: 29.9790, lng: -90.0874, radius: 5000 },
  { name: 'New Orleans Gentilly/Lakeview',      lat: 29.9956, lng: -90.0549, radius: 6000 },
  { name: 'New Orleans East',                   lat: 30.0149, lng: -89.9562, radius: 8000 },
  { name: 'Algiers/West Bank NOLA',             lat: 29.9128, lng: -90.0375, radius: 6000 },
  { name: 'Metairie',                           lat: 29.9996, lng: -90.1674, radius: 7000 },
  { name: 'Kenner',                             lat: 29.9940, lng: -90.2415, radius: 6000 },
  { name: 'Elmwood/Harahan',                    lat: 29.9549, lng: -90.2056, radius: 5000 },
  { name: 'Gretna/Terrytown',                   lat: 29.9144, lng: -90.0543, radius: 6000 },
  { name: 'Harvey/Marrero',                     lat: 29.9010, lng: -90.0779, radius: 7000 },
  { name: 'Westwego/Avondale',                  lat: 29.9054, lng: -90.1434, radius: 5000 },
  { name: 'Chalmette/Arabi (St. Bernard)',      lat: 29.9418, lng: -89.9675, radius: 6000 },
  { name: 'Slidell',                            lat: 30.2752, lng: -89.7812, radius: 7000 },
  { name: 'Mandeville/Covington',               lat: 30.3585, lng: -90.0632, radius: 7000 },
  { name: 'Lacombe/Pearl River (St. Tammany)',  lat: 30.3180, lng: -89.9281, radius: 6000 },
  { name: 'LaPlace/Reserve (St. John)',         lat: 30.0688, lng: -90.4793, radius: 6000 },
  { name: 'Destrehan/Boutte (St. Charles)',     lat: 29.9452, lng: -90.3652, radius: 5000 },
];

// Trades-only categories — covers all major skilled trades
const TRADES_CATEGORIES = [
  // Core trades
  'electrician',
  'plumber',
  'roofing_contractor',
  'painter',
  'locksmith',
  'general_contractor',
  'moving_company',
  'landscaper',
  'tree_service',
  'cleaning_service',
  'pest_control',
  // Additional keyword searches (no dedicated Places type — use keyword param)
  // handled separately in fetchByKeyword()
];

// Keyword-only searches (no Places type for these)
const KEYWORD_SEARCHES = [
  'HVAC contractor New Orleans',
  'air conditioning repair New Orleans',
  'foundation repair New Orleans',
  'concrete contractor New Orleans',
  'fencing contractor New Orleans',
  'tile contractor New Orleans',
  'flooring contractor New Orleans',
  'insulation contractor New Orleans',
  'drywall contractor New Orleans',
  'welding New Orleans',
  'pool service New Orleans',
  'garage door repair New Orleans',
  'window installation New Orleans',
  'kitchen remodeling New Orleans',
  'bathroom remodeling New Orleans',
  'handyman New Orleans',
  'septic service New Orleans',
  'gutter installation New Orleans',
  'pressure washing New Orleans',
  'carpet cleaning New Orleans',
];

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let maxResults = 3000;
let singleCategory = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max' && args[i+1]) maxResults = parseInt(args[++i]);
  if (args[i] === '--category' && args[i+1]) singleCategory = args[++i];
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch (e) { reject(new Error('JSON parse error: ' + buf.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Fetch by type across all zones ────────────────────────────────────────────
async function fetchByType(type, seenIds) {
  const results = [];

  for (const zone of SEARCH_ZONES) {
    let pageToken = null;

    do {
      let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`
        + `?location=${zone.lat},${zone.lng}`
        + `&radius=${zone.radius}`
        + `&type=${encodeURIComponent(type)}`
        + `&key=${API_KEY}`;
      if (pageToken) url += `&pagetoken=${encodeURIComponent(pageToken)}`;

      const res = await httpGet(url);

      if (res.body.status === 'REQUEST_DENIED' || res.body.status === 'INVALID_REQUEST') {
        process.stdout.write(`[${res.body.status}] `);
        return results;
      }
      if (res.body.status === 'ZERO_RESULTS') break;

      for (const p of (res.body.results || [])) {
        if (!seenIds.has(p.place_id) && p.business_status !== 'CLOSED_PERMANENTLY') {
          seenIds.add(p.place_id);
          results.push({ place_id: p.place_id, category: type, zone: zone.name });
        }
      }

      pageToken = res.body.next_page_token || null;
      if (pageToken) await sleep(2000);
    } while (pageToken && results.length < maxResults);

    await sleep(150);
  }

  return results;
}

// ── Fetch by keyword (text search) ───────────────────────────────────────────
async function fetchByKeyword(keyword, seenIds) {
  const results = [];
  // Text search is global — use the center of NOLA metro with large radius
  let pageToken = null;
  let pages = 0;

  do {
    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json`
      + `?query=${encodeURIComponent(keyword)}`
      + `&location=29.9511,-90.0715`
      + `&radius=50000`
      + `&key=${API_KEY}`;
    if (pageToken) url += `&pagetoken=${encodeURIComponent(pageToken)}`;

    const res = await httpGet(url);

    if (res.body.status === 'REQUEST_DENIED' || res.body.status === 'INVALID_REQUEST') {
      process.stdout.write(`[${res.body.status}] `);
      break;
    }
    if (res.body.status === 'ZERO_RESULTS') break;

    for (const p of (res.body.results || [])) {
      if (!seenIds.has(p.place_id) && p.business_status !== 'CLOSED_PERMANENTLY') {
        seenIds.add(p.place_id);
        results.push({ place_id: p.place_id, category: keyword, zone: 'keyword-search' });
      }
    }

    pageToken = res.body.next_page_token || null;
    if (pageToken) await sleep(2500);
    pages++;
  } while (pageToken && pages < 3);

  return results;
}

// ── Enrich place with full details ────────────────────────────────────────────
async function enrichPlace(stub) {
  // Request every available field that's useful
  const fields = [
    'place_id',
    'name',
    'formatted_address',
    'formatted_phone_number',
    'international_phone_number',
    'website',
    'rating',
    'user_ratings_total',
    'reviews',           // up to 5 most relevant reviews
    'opening_hours',
    'business_status',
    'types',
    'geometry',
    'photos',            // up to 10 photo references
    'price_level',
    'url',               // Google Maps URL
    'editorial_summary', // short description if available
    'serves_beer',       // won't apply to trades but harmless
  ].join(',');

  const url = `https://maps.googleapis.com/maps/api/place/details/json`
    + `?place_id=${stub.place_id}`
    + `&fields=${fields}`
    + `&key=${API_KEY}`;

  try {
    const res = await httpGet(url);
    if (res.body.status !== 'OK') return null;
    const r = res.body.result;

    // Parse reviews
    const reviews = (r.reviews || []).map(rv => ({
      author:   rv.author_name || '',
      rating:   rv.rating || null,
      text:     rv.text || '',
      time:     rv.time ? new Date(rv.time * 1000).toISOString() : '',
      relative: rv.relative_time_description || '',
    }));

    // Parse opening hours
    const hours = r.opening_hours
      ? {
          open_now:  r.opening_hours.open_now ?? null,
          weekday_text: r.opening_hours.weekday_text || [],
        }
      : null;

    // Photo URLs (build fetch URLs, first 3 only to stay within quotas)
    const photoUrls = (r.photos || []).slice(0, 3).map(ph =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${ph.photo_reference}&key=${API_KEY}`
    );

    return {
      place_id:          r.place_id || stub.place_id,
      name:              r.name || '',
      address:           r.formatted_address || '',
      phone:             r.formatted_phone_number || '',
      phone_intl:        r.international_phone_number || '',
      website:           r.website || '',
      rating:            r.rating || null,
      review_count:      r.user_ratings_total || 0,
      reviews,
      hours,
      business_status:   r.business_status || 'OPERATIONAL',
      types:             (r.types || []).join(', '),
      category:          stub.category,
      zone:              stub.zone,
      lat:               r.geometry?.location?.lat || null,
      lng:               r.geometry?.location?.lng || null,
      maps_url:          r.url || `https://www.google.com/maps/place/?q=place_id:${stub.place_id}`,
      photo_urls:        photoUrls,
      price_level:       r.price_level ?? null,
      summary:           r.editorial_summary?.overview || '',
      scraped_at:        new Date().toISOString(),
    };
  } catch (e) {
    return null;
  }
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function toCSV(places) {
  const cols = [
    'name','address','phone','website','rating','review_count',
    'business_status','category','hours_text',
    'review_1_author','review_1_rating','review_1_text','review_1_date',
    'review_2_author','review_2_rating','review_2_text','review_2_date',
    'review_3_author','review_3_rating','review_3_text','review_3_date',
    'lat','lng','maps_url','scraped_at'
  ];

  const esc = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = places.map(p => {
    const hoursText = p.hours?.weekday_text?.join(' | ') || '';
    const row = {
      ...p,
      hours_text: hoursText,
    };
    for (let i = 0; i < 3; i++) {
      const rv = p.reviews?.[i];
      row[`review_${i+1}_author`] = rv?.author || '';
      row[`review_${i+1}_rating`] = rv?.rating || '';
      row[`review_${i+1}_text`]   = rv?.text   || '';
      row[`review_${i+1}_date`]   = rv?.relative || '';
    }
    return cols.map(c => esc(row[c])).join(',');
  });

  return [cols.join(','), ...rows].join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🦞 InkThorn — NOLA Trades Business Scraper');
  console.log(`📍 Coverage: ${SEARCH_ZONES.length} zones across Greater New Orleans`);
  console.log(`🔧 Trades categories: ${TRADES_CATEGORIES.length} type searches + ${KEYWORD_SEARCHES.length} keyword searches\n`);

  const seenIds = new Set();
  const stubs = [];   // { place_id, category, zone }

  // Phase 1: Collect place IDs by type
  const categories = singleCategory ? [singleCategory] : TRADES_CATEGORIES;
  for (const cat of categories) {
    process.stdout.write(`  [type]    ${cat.padEnd(35)}`);
    try {
      const found = await fetchByType(cat, seenIds);
      stubs.push(...found);
      console.log(`${found.length} places`);
    } catch(e) {
      console.log(`❌ ${e.message}`);
    }
    await sleep(300);
  }

  // Phase 2: Keyword searches for trade types with no Places type
  if (!singleCategory) {
    for (const kw of KEYWORD_SEARCHES) {
      process.stdout.write(`  [keyword] ${kw.slice(0,35).padEnd(35)}`);
      try {
        const found = await fetchByKeyword(kw, seenIds);
        stubs.push(...found);
        console.log(`${found.length} places`);
      } catch(e) {
        console.log(`❌ ${e.message}`);
      }
      await sleep(400);
    }
  }

  console.log(`\n📋 Total unique places found: ${stubs.length}`);
  console.log(`🔍 Fetching full details for each (this takes a while — ~0.1s/place)...\n`);

  // Phase 3: Enrich each place with full details + reviews
  const places = [];
  for (let i = 0; i < stubs.length; i++) {
    process.stdout.write(`\r   ${i+1}/${stubs.length} — ${(stubs[i].category||'').slice(0,30).padEnd(30)}`);
    const detail = await enrichPlace(stubs[i]);
    if (detail) places.push(detail);
    await sleep(100);
  }

  console.log(`\n\n✅ Enriched ${places.length} businesses with full detail data`);

  // Save JSON (full fidelity — all reviews, all fields)
  const output = {
    generated:    new Date().toISOString(),
    total:        places.length,
    coverage:     'Greater New Orleans metro (NOLA + Metairie, Kenner, Gretna, Harvey, Chalmette, Slidell, Mandeville, Covington, LaPlace)',
    categories:   [...new Set(places.map(p => p.category))],
    places,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(output, null, 2));
  console.log(`\n💾 JSON saved: data/nola-trades.json (${places.length} businesses, full detail)`);

  // Save CSV (flattened — first 3 reviews inlined as columns)
  fs.writeFileSync(OUT_CSV, toCSV(places));
  console.log(`📊 CSV saved: data/nola-trades.csv`);

  // Summary by category
  const byCat = {};
  places.forEach(p => { byCat[p.category] = (byCat[p.category]||0)+1; });
  console.log('\n📈 Businesses by category:');
  Object.entries(byCat)
    .sort((a,b) => b[1]-a[1])
    .forEach(([cat, n]) => console.log(`   ${n.toString().padStart(4)}  ${cat}`));

  // Rating distribution
  const withRating = places.filter(p => p.rating);
  const avgRating = withRating.length
    ? (withRating.reduce((s,p) => s + p.rating, 0) / withRating.length).toFixed(2)
    : 'N/A';
  const withPhone = places.filter(p => p.phone).length;
  const withWebsite = places.filter(p => p.website).length;
  const withReviews = places.filter(p => p.review_count > 0).length;
  const totalReviews = places.reduce((s,p) => s + (p.review_count||0), 0);

  console.log('\n📊 Summary stats:');
  console.log(`   Avg rating:        ${avgRating} ⭐`);
  console.log(`   With phone:        ${withPhone} (${Math.round(withPhone/places.length*100)}%)`);
  console.log(`   With website:      ${withWebsite} (${Math.round(withWebsite/places.length*100)}%)`);
  console.log(`   With reviews:      ${withReviews}`);
  console.log(`   Total reviews:     ${totalReviews.toLocaleString()}`);

  console.log('\n🚀 Done!\n');
}

main().catch(e => { console.error('\n❌ Fatal:', e.message); process.exit(1); });
