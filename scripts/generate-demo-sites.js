#!/usr/bin/env node
/**
 * generate-demo-sites.js
 *
 * Takes leads from data/leads.json and generates a professional
 * demo website for each business at crustacean/demos/[slug]/index.html
 *
 * Usage:
 *   node scripts/generate-demo-sites.js             # generates all new leads
 *   node scripts/generate-demo-sites.js --max 10    # first 10 only
 *   node scripts/generate-demo-sites.js --id <id>   # single business
 */

const fs   = require('fs');
const path = require('path');

const LEADS_FILE  = path.join(__dirname, '..', 'data', 'leads.json');
const DEMOS_DIR   = path.join(__dirname, '..', 'crustacean', 'demos');
const BASE_URL    = 'https://inkthorn.ai/crustacean/demos'; // GitHub Pages URL

// ── Slug helper ───────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// ── Category → industry copy ──────────────────────────────────────────────────
const INDUSTRY_COPY = {
  restaurant:         { hero: 'Great Food Deserves to Be Found', sub: 'Let hungry customers find you online — before they pick somewhere else.' },
  cafe:               { hero: 'Your Café. Online. Always Open.', sub: 'Drive more foot traffic and build a loyal following with your own website.' },
  bar:                { hero: 'Your Bar Has a Story. Tell It Online.', sub: 'Events, specials, and your vibe — all in one place customers can find.' },
  bakery:             { hero: 'Fresh Baked. Freshly Found Online.', sub: 'Show off your creations and let customers order ahead from your own site.' },
  hair_salon:         { hero: 'More Bookings. Less Phone Tag.', sub: 'A professional site means clients find you, book online, and keep coming back.' },
  beauty_salon:       { hero: 'Beautiful Work Deserves a Beautiful Website.', sub: 'Showcase your services and let new clients book you at any hour.' },
  barber_shop:        { hero: 'Sharp Cuts. Sharp Online Presence.', sub: 'Get found by new customers in your neighborhood and beyond.' },
  nail_salon:         { hero: 'Your Nail Art Deserves the Spotlight.', sub: 'A professional website builds trust and brings in new clients every week.' },
  spa:                { hero: 'Relaxation Starts With Being Found.', sub: 'Let clients discover your services, book appointments, and unwind — starting online.' },
  car_repair:         { hero: 'When Cars Break Down, Customers Search Online.', sub: 'Be the first shop they find when something goes wrong.' },
  car_wash:           { hero: 'More Cars. More Revenue. Start Online.', sub: 'Show your services, prices, and location to drivers searching nearby.' },
  electrician:        { hero: 'When the Power\'s Out, They\'ll Search for You.', sub: 'A professional website makes you the first call when homeowners need help.' },
  plumber:            { hero: 'Every Leak Starts a Search. Be There.', sub: 'Show up when it matters most — when homeowners need you now.' },
  roofing_contractor: { hero: 'Storm Season Is Marketing Season.', sub: 'Be the roofer New Orleans finds first when the next storm hits.' },
  florist:            { hero: 'Beautiful Arrangements. Beautiful Website.', sub: 'Let customers order flowers online for every occasion — without calling.' },
  gym:                { hero: 'Your Gym. Found by People Ready to Work.', sub: 'Showcase your equipment, classes, and trainers to members-to-be.' },
  dentist:            { hero: 'New Patients Are Searching. Are You There?', sub: 'A professional website builds trust before they ever walk through the door.' },
  cleaning_service:   { hero: 'Clean Business Starts With Being Found.', sub: 'Homeowners search for cleaning services every day. Show up first.' },
  default:            { hero: 'Your Business. Online. Ready to Grow.', sub: 'A professional website brings new customers to your door — day and night.' },
};

function getIndustryCopy(types) {
  if (!types) return INDUSTRY_COPY.default;
  const typeList = types.split(', ');
  for (const t of typeList) {
    if (INDUSTRY_COPY[t]) return INDUSTRY_COPY[t];
  }
  return INDUSTRY_COPY.default;
}

// ── Google photo URL ──────────────────────────────────────────────────────────
function photoUrl(photoRef, apiKey) {
  if (!photoRef) return null;
  return `https://places.googleapis.com/v1/${photoRef}/media?maxHeightPx=600&maxWidthPx=1200&key=${apiKey}`;
}

// ── Generate star rating HTML ─────────────────────────────────────────────────
function starRating(rating) {
  if (!rating) return '';
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

// ── Build demo HTML ───────────────────────────────────────────────────────────
function buildDemoHTML(lead, apiKey) {
  const copy = getIndustryCopy(lead.types);
  const slug = slugify(lead.name);
  const photo = photoUrl(lead.photoRef, apiKey);
  const demoUrl = `${BASE_URL}/${slug}/`;
  const checkoutUrl = `../../index.html#pricing`;

  const categoryDisplay = lead.category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  const addressParts = lead.address.split(',');
  const streetAddress = addressParts[0] || lead.address;
  const cityStateZip  = addressParts.slice(1).join(',').trim();

  const mapsEmbedUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + ' ' + lead.address)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${lead.name} — New Orleans ${categoryDisplay}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${lead.name} — ${categoryDisplay} in New Orleans. ${lead.address}. Call us: ${lead.phone || 'See details below'}." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy: #0f1f3d; --blue: #2563eb; --gold: #c9922a;
      --cream: #faf8f4; --gray-50: #f9fafb; --gray-100: #f3f4f6;
      --gray-300: #d1d5db; --gray-500: #6b7280; --gray-700: #374151;
      --gray-900: #111827; --white: #ffffff;
    }
    html { scroll-behavior: smooth; }
    body { font-family: 'Inter', system-ui, sans-serif; color: var(--gray-900); background: var(--white); line-height: 1.6; }
    h1, h2, h3 { font-family: 'Playfair Display', Georgia, serif; line-height: 1.2; }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

    /* Demo banner */
    .demo-banner {
      background: var(--navy);
      color: rgba(255,255,255,0.9);
      text-align: center;
      padding: 10px 24px;
      font-size: 0.82rem;
      position: sticky;
      top: 0;
      z-index: 200;
    }
    .demo-banner a {
      color: #f0b840;
      font-weight: 700;
      text-decoration: underline;
    }
    .demo-banner a:hover { color: #fff; }

    /* Nav */
    nav { background: var(--white); border-bottom: 1px solid var(--gray-100); padding: 0 24px; }
    .nav-inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; height: 64px; gap: 16px; }
    .biz-name { font-family: 'Playfair Display', serif; font-size: 1.3rem; font-weight: 900; color: var(--navy); }
    .biz-cat  { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gold); }
    .nav-phone { font-weight: 700; color: var(--blue); font-size: 1rem; text-decoration: none; }
    .nav-phone:hover { text-decoration: underline; }
    .nav-cta { background: var(--blue); color: #fff; padding: 10px 20px; border-radius: 6px; font-weight: 700; font-size: 0.88rem; text-decoration: none; white-space: nowrap; }
    .nav-cta:hover { background: #1d4ed8; }

    /* Hero */
    .hero {
      background: ${photo ? `linear-gradient(rgba(10,25,60,0.72),rgba(10,25,60,0.60)), url('${photo}') center/cover no-repeat` : 'linear-gradient(135deg,#0f1f3d,#1a3460)'};
      color: var(--white);
      padding: 80px 0 72px;
      text-align: center;
    }
    .hero-cat { display: inline-block; background: rgba(201,146,42,0.25); border: 1px solid rgba(240,184,64,0.4); color: #f0b840; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; padding: 5px 16px; border-radius: 999px; margin-bottom: 20px; }
    .hero h1 { font-size: clamp(2rem, 5vw, 3.4rem); font-weight: 900; margin-bottom: 16px; color: #fff; }
    .hero-sub { font-size: 1.1rem; color: rgba(255,255,255,0.8); max-width: 560px; margin: 0 auto 32px; }
    .hero-actions { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
    .btn { display: inline-block; font-family: 'Inter', sans-serif; font-weight: 700; font-size: 1rem; padding: 13px 28px; border-radius: 8px; text-decoration: none; transition: all 0.2s; cursor: pointer; border: none; }
    .btn-primary { background: var(--blue); color: #fff; box-shadow: 0 4px 14px rgba(37,99,235,0.35); }
    .btn-primary:hover { background: #1d4ed8; transform: translateY(-1px); }
    .btn-outline { border: 2px solid rgba(255,255,255,0.4); color: #fff; background: transparent; }
    .btn-outline:hover { background: rgba(255,255,255,0.12); }

    /* Info bar */
    .info-bar { background: var(--gray-50); border-top: 1px solid var(--gray-100); border-bottom: 1px solid var(--gray-100); padding: 20px 0; }
    .info-bar-inner { display: flex; gap: 40px; flex-wrap: wrap; justify-content: center; align-items: center; }
    .info-item { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--gray-700); }
    .info-icon { font-size: 1.1rem; }

    /* About + Services */
    .section { padding: 72px 0; }
    .section-alt { background: var(--gray-50); }
    .section-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: var(--blue); margin-bottom: 10px; }
    .section-title { font-size: clamp(1.7rem, 3.5vw, 2.4rem); color: var(--navy); margin-bottom: 14px; }
    .section-body { font-size: 1rem; color: var(--gray-500); line-height: 1.75; max-width: 640px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
    .services-list { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 28px; }
    .services-list li { display: flex; align-items: center; gap: 10px; font-size: 0.92rem; color: var(--gray-700); }
    .services-list li::before { content: '✓'; color: var(--blue); font-weight: 700; font-size: 1rem; }

    /* Rating */
    .rating-card { background: var(--navy); color: var(--white); border-radius: 16px; padding: 36px; text-align: center; }
    .rating-score { font-family: 'Playfair Display', serif; font-size: 4.5rem; font-weight: 900; color: #f0b840; line-height: 1; }
    .rating-stars { font-size: 1.6rem; color: #f0b840; margin: 8px 0; }
    .rating-count { font-size: 0.88rem; color: rgba(255,255,255,0.6); }
    .rating-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-top: 16px; }

    /* Map */
    .map-section { background: var(--gray-50); padding: 72px 0; }
    .map-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: start; }
    .map-embed { border-radius: 12px; overflow: hidden; border: 1px solid var(--gray-100); height: 320px; }
    .map-embed iframe { width: 100%; height: 100%; border: none; }
    .contact-list { list-style: none; }
    .contact-item { display: flex; gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--gray-100); }
    .contact-item:last-child { border-bottom: none; }
    .contact-icon { font-size: 1.2rem; flex-shrink: 0; }
    .contact-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--gray-500); margin-bottom: 3px; }
    .contact-value { font-size: 0.95rem; color: var(--gray-900); font-weight: 500; }
    .contact-value a { color: var(--blue); text-decoration: none; }
    .contact-value a:hover { text-decoration: underline; }

    /* CTA */
    .cta-section { background: var(--navy); color: var(--white); padding: 72px 0; text-align: center; }
    .cta-section h2 { font-size: clamp(1.8rem, 4vw, 2.6rem); color: var(--white); margin-bottom: 14px; }
    .cta-section p { color: rgba(255,255,255,0.7); font-size: 1rem; max-width: 480px; margin: 0 auto 28px; }

    /* Footer */
    footer { background: var(--gray-900); color: rgba(255,255,255,0.5); padding: 28px 0; text-align: center; font-size: 0.8rem; }
    footer a { color: #f0b840; text-decoration: none; }

    /* Responsive */
    @media (max-width: 700px) {
      .two-col, .map-grid { grid-template-columns: 1fr; }
      .services-list { grid-template-columns: 1fr; }
      .hero { padding: 56px 0; }
    }
  </style>
</head>
<body>

  <!-- Demo Banner -->
  <div class="demo-banner">
    🦞 This is a <strong>free demo website</strong> built for ${escHtmlNode(lead.name)} by InkThorn Crustacean.
    Like what you see? <a href="${checkoutUrl}">Claim this site from $39/month →</a>
  </div>

  <!-- Nav -->
  <nav>
    <div class="nav-inner">
      <div>
        <div class="biz-name">${escHtmlNode(lead.name)}</div>
        <div class="biz-cat">${categoryDisplay}</div>
      </div>
      ${lead.phone ? `<a href="tel:${lead.phone.replace(/\D/g,'')}" class="nav-phone">📞 ${escHtmlNode(lead.phone)}</a>` : ''}
      <a href="${checkoutUrl}" class="nav-cta">Claim This Site</a>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="container">
      <div class="hero-cat">${categoryDisplay} · New Orleans</div>
      <h1>${escHtmlNode(lead.name)}</h1>
      <p class="hero-sub">${copy.hero} — ${copy.sub}</p>
      <div class="hero-actions">
        ${lead.phone ? `<a href="tel:${lead.phone.replace(/\D/g,'')}" class="btn btn-primary">📞 Call Now</a>` : ''}
        <a href="${mapsEmbedUrl}" target="_blank" rel="noopener" class="btn btn-outline">📍 Get Directions</a>
      </div>
    </div>
  </section>

  <!-- Info Bar -->
  <div class="info-bar">
    <div class="container info-bar-inner">
      ${lead.phone ? `<div class="info-item"><span class="info-icon">📞</span> <a href="tel:${lead.phone.replace(/\D/g,'')}" style="color:inherit;font-weight:600;">${escHtmlNode(lead.phone)}</a></div>` : ''}
      <div class="info-item"><span class="info-icon">📍</span> ${escHtmlNode(streetAddress)}</div>
      ${lead.rating ? `<div class="info-item"><span class="info-icon">⭐</span> <strong>${lead.rating}</strong>&nbsp;(${lead.reviewCount} reviews)</div>` : ''}
      <div class="info-item"><span class="info-icon">🌐</span> New Orleans, Louisiana</div>
    </div>
  </div>

  <!-- About -->
  <section class="section">
    <div class="container">
      <div class="two-col">
        <div>
          <div class="section-label">About Us</div>
          <h2 class="section-title">Welcome to ${escHtmlNode(lead.name)}</h2>
          <p class="section-body">
            ${escHtmlNode(lead.name)} is a trusted ${categoryDisplay.toLowerCase()} serving the New Orleans community.
            ${lead.address ? `Located at ${escHtmlNode(lead.address)}, we're here to serve you.` : ''}
            ${lead.rating ? `With a ${lead.rating}-star rating from ${lead.reviewCount} Google reviews, our customers speak for themselves.` : ''}
          </p>
          <ul class="services-list">
            <li>Serving New Orleans</li>
            <li>Locally Owned</li>
            ${lead.phone ? '<li>Call or Text Us</li>' : ''}
            <li>Quality You Can Trust</li>
            ${lead.rating ? `<li>${lead.rating}★ Rated</li>` : ''}
            <li>Community Focused</li>
          </ul>
        </div>
        ${lead.rating ? `
        <div class="rating-card">
          <div class="rating-score">${lead.rating}</div>
          <div class="rating-stars">${starRating(lead.rating)}</div>
          <div class="rating-count">${lead.reviewCount} Google Reviews</div>
          <div class="rating-label">Customer Rating</div>
        </div>` : `
        <div style="background:var(--gray-50);border-radius:16px;padding:36px;text-align:center;">
          <div style="font-size:3rem;margin-bottom:12px;">🌟</div>
          <p style="color:var(--gray-500);font-size:0.9rem;">Trusted by New Orleans customers.<br>Find us on Google Maps.</p>
          <a href="${mapsEmbedUrl}" target="_blank" rel="noopener" style="display:inline-block;margin-top:16px;color:var(--blue);font-weight:700;font-size:0.88rem;">View on Google Maps →</a>
        </div>`}
      </div>
    </div>
  </section>

  <!-- Map & Contact -->
  <section class="map-section">
    <div class="container">
      <div class="map-grid">
        <div>
          <div class="section-label">Find Us</div>
          <h2 class="section-title" style="margin-bottom:24px;">Location &amp; Contact</h2>
          <ul class="contact-list">
            <li class="contact-item">
              <span class="contact-icon">📍</span>
              <div>
                <div class="contact-label">Address</div>
                <div class="contact-value">${escHtmlNode(streetAddress)}<br>${escHtmlNode(cityStateZip)}</div>
              </div>
            </li>
            ${lead.phone ? `
            <li class="contact-item">
              <span class="contact-icon">📞</span>
              <div>
                <div class="contact-label">Phone</div>
                <div class="contact-value"><a href="tel:${lead.phone.replace(/\D/g,'')}">${escHtmlNode(lead.phone)}</a></div>
              </div>
            </li>` : ''}
            <li class="contact-item">
              <span class="contact-icon">🗺</span>
              <div>
                <div class="contact-label">Google Maps</div>
                <div class="contact-value"><a href="${lead.mapsUrl || mapsEmbedUrl}" target="_blank" rel="noopener">View on Google Maps</a></div>
              </div>
            </li>
          </ul>
        </div>
        <div class="map-embed">
          <iframe
            src="https://maps.google.com/maps?q=${encodeURIComponent(lead.name + ' ' + lead.address)}&output=embed&z=15"
            allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
            title="${escHtmlNode(lead.name)} location map">
          </iframe>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="cta-section">
    <div class="container">
      <h2>${escHtmlNode(lead.name)} — Ready to Grow?</h2>
      <p>This demo site was built for free by InkThorn Crustacean. Claim it, customize it, and start bringing in new customers today.</p>
      <a href="${checkoutUrl}" class="btn btn-primary" style="font-size:1.05rem;padding:16px 36px;">Claim This Website — From $39/mo</a>
    </div>
  </section>

  <!-- Footer -->
  <footer>
    <div class="container">
      <p>Demo website built by <a href="https://inkthorn.ai/crustacean">InkThorn Crustacean Web Development</a> for ${escHtmlNode(lead.name)} · <a href="${checkoutUrl}">Claim this site</a></p>
    </div>
  </footer>

</body>
</html>`;
}

function escHtmlNode(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let maxSites = 9999;
let filterId = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max' && args[i+1]) maxSites = parseInt(args[++i]);
  if (args[i] === '--id' && args[i+1])  filterId = args[++i];
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(LEADS_FILE)) {
    console.error('❌ No leads file found. Run scrape-leads.js first.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  let leads = data.leads || [];

  if (filterId) leads = leads.filter(l => l.id === filterId);

  // Skip leads that already have a demo site
  const existing = new Set();
  if (fs.existsSync(DEMOS_DIR)) {
    fs.readdirSync(DEMOS_DIR).forEach(d => existing.add(d));
  }
  const newLeads = leads.filter(l => !existing.has(slugify(l.name))).slice(0, maxSites);

  console.log(`\n🦞 InkThorn Crustacean — Demo Site Generator`);
  console.log(`📋 Leads loaded: ${leads.length} total, ${newLeads.length} need demo sites\n`);

  if (!fs.existsSync(DEMOS_DIR)) fs.mkdirSync(DEMOS_DIR, { recursive: true });

  let built = 0;
  const index = [];

  for (const lead of newLeads) {
    const slug = slugify(lead.name);
    if (!slug) continue;
    const siteDir = path.join(DEMOS_DIR, slug);
    fs.mkdirSync(siteDir, { recursive: true });
    const html = buildDemoHTML(lead, 'AIzaSyAH8hrdixADjgcGPvDY8dPIshCGILs8Nzo');
    fs.writeFileSync(path.join(siteDir, 'index.html'), html);
    built++;
    index.push({ slug, name: lead.name, category: lead.category, phone: lead.phone, url: `${BASE_URL}/${slug}/` });
    console.log(`  ✅ ${lead.name.padEnd(45)} → crustacean/demos/${slug}/`);
  }

  // Write demos index
  fs.writeFileSync(
    path.join(DEMOS_DIR, 'index.json'),
    JSON.stringify({ generated: new Date().toISOString(), count: index.length, sites: index }, null, 2)
  );

  console.log(`\n✅ Done: ${built} demo sites built`);
  console.log(`📁 Location: crustacean/demos/`);
  console.log(`🌐 Live at: https://inkthorn.ai/crustacean/demos/[business-name]/\n`);
}

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

main();
