#!/usr/bin/env node
/**
 * scrape-leads.js
 *
 * Uses Google Places API (New) to find New Orleans businesses with no website.
 * Exports results to data/leads.json and data/leads.csv
 *
 * Usage:
 *   node scripts/scrape-leads.js
 *   node scripts/scrape-leads.js --category "hair salon"
 *   node scripts/scrape-leads.js --max 200
 *   node scripts/scrape-leads.js --all   (runs all categories)
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const API_KEY   = 'AIzaSyAH8hrdixADjgcGPvDY8dPIshCGILs8Nzo';
const OUT_DIR   = path.join(__dirname, '..', 'data');
const LEADS_JSON = path.join(OUT_DIR, 'leads.json');
const LEADS_CSV  = path.join(OUT_DIR, 'leads.csv');

// Search grid: New Orleans + all surrounding cities/parishes
// Multiple center points ensure full coverage without gaps
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

// Business categories to sweep — these are Google Places "includedTypes"
const ALL_CATEGORIES = [
  'restaurant', 'cafe', 'bar', 'bakery', 'meal_delivery',
  'hair_salon', 'beauty_salon', 'barber_shop', 'nail_salon', 'spa',
  'car_repair', 'car_wash', 'auto_parts_store',
  'electrician', 'plumber', 'roofing_contractor', 'painter', 'locksmith',
  'laundry', 'dry_cleaning',
  'florist', 'pet_store', 'pet_grooming',
  'clothing_store', 'shoe_store', 'jewelry_store', 'gift_shop',
  'gym', 'yoga_studio',
  'insurance_agency', 'accounting', 'real_estate_agency', 'lawyer',
  'dentist', 'doctor', 'physiotherapist', 'optician',
  'moving_company', 'storage',
  'catering_service', 'event_venue',
  'photography_studio', 'printing',
  'music_store', 'musical_instrument_store',
  'tattoo_parlor',
  'cleaning_service',
  'landscaper', 'tree_service',
];

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let runAll = args.includes('--all');
let maxResults = 500;
let singleCategory = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max' && args[i+1]) maxResults = parseInt(args[++i]);
  if (args[i] === '--category' && args[i+1]) singleCategory = args[++i];
}

const categoriesToRun = singleCategory
  ? [singleCategory]
  : runAll
  ? ALL_CATEGORIES
  : ALL_CATEGORIES.slice(0, 8); // Default: first 8 categories (safe free tier)

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.types,places.googleMapsUri,places.currentOpeningHours,places.photos',
        ...headers,
      },
    };
    const req = https.request(options, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch (e) { reject(new Error('JSON parse error: ' + buf.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Fetch one category across all zones ──────────────────────────────────────
async function fetchCategory(type) {
  const results = [];
  const seenIds = new Set();

  for (const zone of SEARCH_ZONES) {
    let pageToken = null;

    do {
      const body = {
        includedTypes: [type],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: zone.lat, longitude: zone.lng },
            radius: zone.radius,
          },
        },
      };
      if (pageToken) body.pageToken = pageToken;

      const res = await httpPost(
        'https://places.googleapis.com/v1/places:searchNearby',
        body
      );

      if (res.status !== 200) {
        // Log quietly and move to next zone
        process.stdout.write(`[${res.status}] `);
        break;
      }

      const places = res.body.places || [];
      for (const p of places) {
        if (seenIds.has(p.id)) continue; // dedupe across zones
        seenIds.add(p.id);
        // Filter: no website, business is operational
        if (!p.websiteUri && p.businessStatus !== 'CLOSED_PERMANENTLY') {
          results.push({
            id:          p.id || '',
            name:        p.displayName?.text || '',
            address:     p.formattedAddress || '',
            phone:       p.nationalPhoneNumber || '',
            website:     '',
            rating:      p.rating || null,
            reviewCount: p.userRatingCount || 0,
            types:       (p.types || []).join(', '),
            category:    type,
            zone:        zone.name,
            mapsUrl:     p.googleMapsUri || '',
            photoRef:    p.photos?.[0]?.name || '',
            status:      p.businessStatus || 'OPERATIONAL',
            scrapedAt:   new Date().toISOString(),
          });
        }
      }

      pageToken = res.body.nextPageToken || null;
      if (pageToken) await sleep(1200); // rate limit
    } while (pageToken && results.length < maxResults);

    await sleep(200); // brief pause between zones
  }

  return results;
}

// ── Generate outreach copy ────────────────────────────────────────────────────
function generateOutreach(lead) {
  const firstName = lead.name.split(' ')[0];
  const ratingLine = lead.rating
    ? `You have a ${lead.rating}⭐ rating with ${lead.reviewCount} reviews on Google — that's a real asset.`
    : `You have reviews on Google that are bringing people in.`;

  return [
    `Hi there,`,
    ``,
    `I noticed that ${lead.name} doesn't have a website yet — so I went ahead and built one for you.`,
    ``,
    `It's live at: [DEMO_URL]`,
    ``,
    `${ratingLine} A website will help you convert that attention into more customers.`,
    ``,
    `We build and maintain professional websites for New Orleans businesses starting at $39/month — and you can see exactly what you're getting before you pay anything.`,
    ``,
    `If you'd like to keep it, update it, or just chat — reply here or call/text anytime.`,
    ``,
    `— InkThorn Crustacean Web Development`,
    `   hello@inkthorn.ai | inkthorn.ai/crustacean`,
  ].join('\n');
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function toCSV(leads) {
  const cols = ['name','address','phone','rating','reviewCount','category','mapsUrl','status','scrapedAt','outreach'];
  const header = cols.join(',');
  const rows = leads.map(l => {
    const outreach = generateOutreach(l).replace(/"/g, '""');
    return cols.map(c => {
      const val = c === 'outreach' ? outreach : (l[c] ?? '');
      const s = String(val);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    }).join(',');
  });
  return [header, ...rows].join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🦞 InkThorn Crustacean — Lead Scraper');
  console.log(`📍 Coverage: ${SEARCH_ZONES.length} zones — NOLA + Metairie, Kenner, Gretna, Harvey, Chalmette, Slidell, Mandeville, Covington, LaPlace`);
  console.log(`📂 Categories: ${categoriesToRun.length} (${categoriesToRun.slice(0,4).join(', ')}${categoriesToRun.length > 4 ? '…' : ''})`);
  console.log(`🎯 Filter: No website · Operational businesses only\n`);

  // Load existing leads to deduplicate
  let existingIds = new Set();
  if (fs.existsSync(LEADS_JSON)) {
    try {
      const existing = JSON.parse(fs.readFileSync(LEADS_JSON, 'utf8'));
      existingIds = new Set((existing.leads || []).map(l => l.id));
      console.log(`📋 Existing leads loaded: ${existingIds.size}\n`);
    } catch {}
  }

  const allLeads = [];
  let totalFetched = 0;

  for (const cat of categoriesToRun) {
    process.stdout.write(`  Scanning: ${cat.padEnd(35)}`);
    try {
      const leads = await fetchCategory(cat);
      const newLeads = leads.filter(l => !existingIds.has(l.id));
      allLeads.push(...newLeads);
      newLeads.forEach(l => existingIds.add(l.id));
      totalFetched += leads.length;
      console.log(`${leads.length} found · ${newLeads.length} new no-website leads`);
    } catch(e) {
      console.log(`❌ Error: ${e.message}`);
    }
    await sleep(300);
  }

  console.log(`\n✅ Scan complete`);
  console.log(`   Total places checked: ${totalFetched}`);
  console.log(`   New leads (no website): ${allLeads.length}`);

  if (!allLeads.length) {
    console.log('\n⚠  No new leads found. Try --all to scan all categories.\n');
    return;
  }

  // Load + merge with existing
  let allData = { leads: [], generated: new Date().toISOString(), totalLeads: 0 };
  if (fs.existsSync(LEADS_JSON)) {
    try { allData = JSON.parse(fs.readFileSync(LEADS_JSON, 'utf8')); } catch {}
  }
  allData.leads = [...(allData.leads || []), ...allLeads];
  allData.totalLeads = allData.leads.length;
  allData.lastUpdated = new Date().toISOString();

  // Save JSON
  fs.writeFileSync(LEADS_JSON, JSON.stringify(allData, null, 2));
  console.log(`\n💾 JSON saved: data/leads.json (${allData.totalLeads} total leads)`);

  // Save CSV
  fs.writeFileSync(LEADS_CSV, toCSV(allData.leads));
  console.log(`📊 CSV saved: data/leads.csv`);

  // Summary by category
  const byCat = {};
  allLeads.forEach(l => { byCat[l.category] = (byCat[l.category]||0)+1; });
  console.log('\n📈 New leads by category:');
  Object.entries(byCat)
    .sort((a,b) => b[1]-a[1])
    .forEach(([cat, n]) => console.log(`   ${n.toString().padStart(3)}  ${cat}`));

  // Top leads by review count (best outreach targets)
  const topLeads = [...allLeads]
    .sort((a,b) => (b.reviewCount||0) - (a.reviewCount||0))
    .slice(0, 5);

  console.log('\n⭐ Top 5 highest-rated leads (best outreach targets):');
  topLeads.forEach(l => {
    console.log(`   ${l.name}`);
    console.log(`   ${l.address}`);
    console.log(`   📞 ${l.phone || 'no phone'} · ${l.rating || 'no rating'}⭐ (${l.reviewCount} reviews)`);
    console.log(`   🗺  ${l.mapsUrl}`);
    console.log('');
  });

  console.log(`\n🚀 Next step: Run generate-demo-sites.js to build websites for these leads\n`);
}

main().catch(e => { console.error('\n❌ Fatal error:', e.message); process.exit(1); });
