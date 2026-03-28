#!/usr/bin/env node
/**
 * scrape-baton-rouge-leads.js
 *
 * Uses Google Places API (New) to find Baton Rouge MSA businesses with no website.
 * Exports results to data/baton-rouge-leads.json and data/baton-rouge-leads.csv
 *
 * Usage:
 *   node scripts/scrape-baton-rouge-leads.js
 *   node scripts/scrape-baton-rouge-leads.js --category "hair salon"
 *   node scripts/scrape-baton-rouge-leads.js --max 200
 *   node scripts/scrape-baton-rouge-leads.js --all   (runs all categories)
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const API_KEY   = 'AIzaSyAH8hrdixADjgcGPvDY8dPIshCGILs8Nzo';
const OUT_DIR   = path.join(__dirname, '..', 'data');
const LEADS_JSON = path.join(OUT_DIR, 'baton-rouge-leads.json');
const LEADS_CSV  = path.join(OUT_DIR, 'baton-rouge-leads.csv');

// Search grid: Baton Rouge MSA — covers all surrounding cities/parishes
const SEARCH_ZONES = [
  { name: 'Baton Rouge Downtown/CBD',          lat: 30.4515, lng: -91.1871, radius: 5000 },
  { name: 'Baton Rouge Mid-City',               lat: 30.4583, lng: -91.1403, radius: 6000 },
  { name: 'Baton Rouge South (Siegen/Perkins)', lat: 30.3711, lng: -91.0567, radius: 7000 },
  { name: 'Baton Rouge North',                  lat: 30.5012, lng: -91.1512, radius: 6000 },
  { name: 'Baton Rouge LSU/Garden District',    lat: 30.4122, lng: -91.1801, radius: 5000 },
  { name: 'Baton Rouge Airline/Sherwood',       lat: 30.4200, lng: -91.0672, radius: 6000 },
  { name: 'Baker',                              lat: 30.5849, lng: -91.1619, radius: 5000 },
  { name: 'Central',                            lat: 30.5514, lng: -91.0563, radius: 5000 },
  { name: 'Zachary',                            lat: 30.6560, lng: -91.1582, radius: 5000 },
  { name: 'Port Allen / West Baton Rouge',      lat: 30.4517, lng: -91.2133, radius: 5000 },
  { name: 'Plaquemine / Iberville',             lat: 30.2899, lng: -91.2338, radius: 6000 },
  { name: 'Gonzales / Ascension',               lat: 30.2066, lng: -90.9206, radius: 7000 },
  { name: 'Prairieville',                       lat: 30.2975, lng: -90.9723, radius: 5000 },
  { name: 'Sorrento / St. Amant',               lat: 30.1796, lng: -90.8694, radius: 5000 },
  { name: 'Walker',                             lat: 30.4880, lng: -90.8600, radius: 6000 },
  { name: 'Denham Springs',                     lat: 30.4883, lng: -90.9551, radius: 6000 },
  { name: 'Livingston',                         lat: 30.4942, lng: -90.7547, radius: 5000 },
  { name: 'Brusly / Addis (WBR)',               lat: 30.3760, lng: -91.2544, radius: 5000 },
  { name: 'Shenandoah / Drusilla',              lat: 30.3900, lng: -91.0800, radius: 5000 },
  { name: 'Zachary North / Clinton area',       lat: 30.7200, lng: -91.1400, radius: 6000 },
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

// ── Fetch one category across all zones (old Places API) ─────────────────────
async function fetchCategory(type) {
  const results = [];
  const seenIds = new Set();

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

      if (res.status !== 200 || res.body.status === 'REQUEST_DENIED' || res.body.status === 'INVALID_REQUEST') {
        process.stdout.write(`[${res.body.status||res.status}] `);
        break;
      }

      // ZERO_RESULTS is fine — just no results in this zone for this type
      if (res.body.status === 'ZERO_RESULTS') break;

      const places = res.body.results || [];
      for (const p of places) {
        if (seenIds.has(p.place_id)) continue;
        seenIds.add(p.place_id);

        // Skip permanently closed
        if (p.business_status === 'CLOSED_PERMANENTLY') continue;

        // Key filter: no website field in basic response
        // We'll do a detail lookup only for promising leads (rated businesses)
        // to keep API costs low — unrated/low-review places get skipped
        if (!p.website) {
          results.push({
            id:          p.place_id || '',
            name:        p.name || '',
            address:     p.vicinity || '',
            phone:       '', // populated in detail pass
            website:     '',
            rating:      p.rating || null,
            reviewCount: p.user_ratings_total || 0,
            types:       (p.types || []).join(', '),
            category:    type,
            zone:        zone.name,
            mapsUrl:     `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
            photoRef:    p.photos?.[0]?.photo_reference || '',
            status:      p.business_status || 'OPERATIONAL',
            scrapedAt:   new Date().toISOString(),
          });
        }
      }

      pageToken = res.body.next_page_token || null;
      if (pageToken) await sleep(2000); // Google requires ~2s before next_page_token is valid
    } while (pageToken && results.length < maxResults);

    await sleep(150);
  }

  return results;
}

// ── Enrich a lead with phone via Place Details ────────────────────────────────
async function enrichLeadPhone(lead) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json`
    + `?place_id=${lead.id}`
    + `&fields=formatted_phone_number,website,formatted_address`
    + `&key=${API_KEY}`;
  try {
    const res = await httpGet(url);
    if (res.body.status === 'OK') {
      const r = res.body.result;
      // If they actually have a website in details, remove from leads
      if (r.website) return null;
      lead.phone   = r.formatted_phone_number || '';
      lead.address = r.formatted_address || lead.address;
    }
  } catch {}
  return lead;
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
    `We build and maintain professional websites for Baton Rouge businesses starting at $39/month — and you can see exactly what you're getting before you pay anything.`,
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
  console.log('\n🎯 InkThorn Crustacean — Baton Rouge Lead Scraper');
  console.log(`📍 Coverage: ${SEARCH_ZONES.length} zones — Baton Rouge MSA + surrounding parishes`);
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

  // ── Enrich with phone numbers via Place Details ──
  if (allLeads.length > 0) {
    console.log(`\n📞 Enriching ${allLeads.length} leads with phone numbers (Detail API)...`);
    const enriched = [];
    for (let i = 0; i < allLeads.length; i++) {
      const lead = allLeads[i];
      process.stdout.write(`\r   ${i+1}/${allLeads.length} — ${lead.name.slice(0,40).padEnd(40)}`);
      const result = await enrichLeadPhone(lead);
      if (result) enriched.push(result); // null = actually has website, discard
      await sleep(100);
    }
    console.log(`\n   ✅ ${enriched.length} confirmed no-website leads after detail check`);
    // Replace allLeads with enriched
    allLeads.length = 0;
    allLeads.push(...enriched);
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
  console.log(`\n💾 JSON saved: data/baton-rouge-leads.json (${allData.totalLeads} total leads)`);

  // Save CSV
  fs.writeFileSync(LEADS_CSV, toCSV(allData.leads));
  console.log(`📊 CSV saved: data/baton-rouge-leads.csv`);

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

  console.log(`\n🚀 Next step: Run generate-baton-rouge-demo-sites.js to build websites for these leads\n`);
}

main().catch(e => { console.error('\n❌ Fatal error:', e.message); process.exit(1); });
