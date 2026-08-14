#!/usr/bin/env node
/**
 * scrape-trades-nola.js
 *
 * Uses Google Places API to find New Orleans trades businesses (all — with or without website).
 * Captures full review info, phone, address, website, hours, and all available metadata.
 *
 * Trades included: electrician, plumber, HVAC, roofer, painter, general contractor,
 * locksmith, mover, pest control, handyman, landscaper, cleaning, pool, tree, masonry, etc.
 *
 * Usage:
 *   node scripts/scrape-trades-nola.js            # all trades, all zones
 *   node scripts/scrape-trades-nola.js --category electrician
 *   node scripts/scrape-trades-nola.js --max 2000
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Config ───────────────────────────────────────────────────────────────────
const API_KEY    = 'AIzaSyBYZoSeGlLW0jyt8mE_Ii9TtAzZSfT00-0';
const OUT_DIR    = path.join(__dirname, '..', 'data');
const OUT_JSON   = path.join(OUT_DIR, 'nola-trades.json');
const OUT_CSV    = path.join(OUT_DIR, 'nola-trades.csv');

// New Orleans metro search grid
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

// Trades & home services categories
const TRADES_CATEGORIES = [
  'electrician',
  'plumber',
  'roofing_contractor',
  'general_contractor',
  'painter',
  'locksmith',
  'moving_company',
  'hvac_contractor',
  'pest_control_service',
  'handyman',
  'landscaper',
  'lawn_care_service',
  'tree_service',
  'cleaning_service',
  'house_cleaning_service',
  'pool_cleaning_service',
  'swimming_pool_contractor',
  'flooring_contractor',
  'tile_contractor',
  'drywall_contractor',
  'concrete_contractor',
  'masonry_contractor',
  'fence_contractor',
  'window_installation_service',
  'insulation_contractor',
  'waterproofing_service',
  'septic_system_service',
  'pressure_washing_service',
  'gutter_cleaning_service',
  'chimney_sweep',
  'air_conditioning_repair_service',
  'heating_contractor',
  'garage_door_supplier',
  'fire_protection_service',
  'security_system_supplier',
  'solar_energy_equipment_supplier',
  'demolition_contractor',
];

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let maxResults = 5000;
let singleCategory = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max' && args[i+1]) maxResults = parseInt(args[++i]);
  if (args[i] === '--category' && args[i+1]) singleCategory = args[++i];
}

const categoriesToRun = singleCategory ? [singleCategory] : TRADES_CATEGORIES;

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch (e) { reject(new Error('JSON parse error: ' + buf.slice(0, 300))); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Fetch one category across all zones ───────────────────────────────────────
async function fetchCategory(type, seenIds) {
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

      if (res.status !== 200 || ['REQUEST_DENIED', 'INVALID_REQUEST'].includes(res.body.status)) {
        process.stdout.write(`[${res.body.status || res.status}] `);
        break;
      }
      if (res.body.status === 'ZERO_RESULTS') break;

      const places = res.body.results || [];
      for (const p of places) {
        if (seenIds.has(p.place_id)) continue;
        if (p.business_status === 'CLOSED_PERMANENTLY') continue;
        seenIds.add(p.place_id);

        results.push({
          id:          p.place_id || '',
          name:        p.name || '',
          address:     p.vicinity || '',
          phone:       '',           // enriched in detail pass
          website:     '',           // enriched in detail pass
          rating:      p.rating ?? null,
          reviewCount: p.user_ratings_total ?? 0,
          types:       (p.types || []).join(', '),
          category:    type,
          zone:        zone.name,
          mapsUrl:     `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
          status:      p.business_status || 'OPERATIONAL',
          // Will be filled by detail pass:
          hours:       '',
          openNow:     '',
          priceLevel:  p.price_level ?? '',
          scrapedAt:   new Date().toISOString(),
        });
      }

      pageToken = res.body.next_page_token || null;
      if (pageToken) await sleep(2100);
    } while (pageToken && results.length < maxResults);

    await sleep(150);
  }

  return results;
}

// ── Enrich with Place Details (phone, website, full address, hours) ───────────
async function enrichLead(lead) {
  const fields = [
    'formatted_phone_number',
    'international_phone_number',
    'website',
    'formatted_address',
    'opening_hours',
    'business_status',
    'rating',
    'user_ratings_total',
    'reviews',
    'price_level',
    'url',
  ].join(',');

  const url = `https://maps.googleapis.com/maps/api/place/details/json`
    + `?place_id=${lead.id}`
    + `&fields=${encodeURIComponent(fields)}`
    + `&key=${API_KEY}`;

  try {
    const res = await httpGet(url);
    if (res.body.status === 'OK') {
      const r = res.body.result;
      lead.phone        = r.formatted_phone_number || r.international_phone_number || '';
      lead.website      = r.website || '';
      lead.address      = r.formatted_address || lead.address;
      lead.rating       = r.rating ?? lead.rating;
      lead.reviewCount  = r.user_ratings_total ?? lead.reviewCount;
      lead.priceLevel   = r.price_level ?? lead.priceLevel;
      lead.googleMapsUrl = r.url || lead.mapsUrl;

      // Hours summary
      if (r.opening_hours) {
        lead.openNow  = r.opening_hours.open_now ? 'yes' : 'no';
        lead.hours    = (r.opening_hours.weekday_text || []).join(' | ');
      }

      // Top 5 reviews (text + rating + date)
      if (r.reviews && r.reviews.length) {
        lead.reviews = r.reviews.slice(0, 5).map(rv => ({
          author:      rv.author_name || '',
          rating:      rv.rating,
          relativeTime: rv.relative_time_description || '',
          text:        rv.text ? rv.text.replace(/\n/g, ' ').slice(0, 500) : '',
        }));
        lead.reviewsText = lead.reviews.map(rv =>
          `[${rv.rating}★ ${rv.relativeTime}] ${rv.author}: ${rv.text}`
        ).join(' ||| ');
      } else {
        lead.reviews = [];
        lead.reviewsText = '';
      }
    }
  } catch {}
  return lead;
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function toCSV(leads) {
  const cols = [
    'name', 'category', 'address', 'phone', 'website',
    'rating', 'reviewCount', 'openNow', 'hours',
    'types', 'zone', 'status', 'priceLevel',
    'googleMapsUrl', 'reviewsText', 'scrapedAt',
  ];
  const header = cols.join(',');
  const rows = leads.map(l => {
    return cols.map(c => {
      const val = l[c] ?? '';
      const s = String(val);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(',');
  });
  return [header, ...rows].join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔧 NOLA Trades Scraper');
  console.log(`📍 ${SEARCH_ZONES.length} zones · ${categoriesToRun.length} trade types`);
  console.log(`🎯 All operational trades businesses — with or without website\n`);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const seenIds = new Set();
  const allLeads = [];

  for (const cat of categoriesToRun) {
    process.stdout.write(`  Scanning: ${cat.padEnd(38)}`);
    try {
      const leads = await fetchCategory(cat, seenIds);
      allLeads.push(...leads);
      console.log(`${leads.length} found`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
    await sleep(300);
  }

  console.log(`\n📋 Total unique places found: ${allLeads.length}`);
  console.log(`📞 Enriching with Place Details (phone, website, hours, reviews)...`);

  const BATCH = 5; // parallel detail calls
  for (let i = 0; i < allLeads.length; i += BATCH) {
    const batch = allLeads.slice(i, i + BATCH);
    process.stdout.write(`\r   ${Math.min(i + BATCH, allLeads.length)}/${allLeads.length}`);
    await Promise.all(batch.map(l => enrichLead(l)));
    await sleep(200);
  }
  console.log('\n   ✅ Enrichment complete');

  // ── Save outputs ─────────────────────────────────────────────────────────
  const output = {
    generated:  new Date().toISOString(),
    totalLeads: allLeads.length,
    categories: categoriesToRun,
    leads:      allLeads,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(output, null, 2));
  console.log(`\n💾 JSON → data/nola-trades.json (${allLeads.length} businesses)`);

  fs.writeFileSync(OUT_CSV, toCSV(allLeads));
  console.log(`📊 CSV  → data/nola-trades.csv`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const byCat = {};
  allLeads.forEach(l => { byCat[l.category] = (byCat[l.category] || 0) + 1; });
  console.log('\n📈 Businesses by trade:');
  Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, n]) => console.log(`   ${String(n).padStart(4)}  ${cat}`));

  const withPhone   = allLeads.filter(l => l.phone).length;
  const withWebsite = allLeads.filter(l => l.website).length;
  const withReviews = allLeads.filter(l => l.reviewCount > 0).length;
  const avgRating   = (allLeads.reduce((s, l) => s + (l.rating || 0), 0) / allLeads.filter(l => l.rating).length).toFixed(2);

  console.log('\n📊 Coverage:');
  console.log(`   ${withPhone}/${allLeads.length} have phone numbers (${Math.round(withPhone/allLeads.length*100)}%)`);
  console.log(`   ${withWebsite}/${allLeads.length} have websites (${Math.round(withWebsite/allLeads.length*100)}%)`);
  console.log(`   ${withReviews}/${allLeads.length} have reviews`);
  console.log(`   Average rating: ${avgRating}⭐`);

  console.log('\n✅ Done\n');
}

main().catch(e => { console.error('\n❌ Fatal:', e.message); process.exit(1); });
