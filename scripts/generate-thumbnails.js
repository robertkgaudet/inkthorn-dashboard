#!/usr/bin/env node
/**
 * generate-thumbnails.js
 * 
 * Generates social media thumbnails for Rob Gaudet's content scripts
 * using ImageMagick (convert). Thumbnails are 1280x720 (YouTube/16:9 standard).
 * 
 * Usage:
 *   node scripts/generate-thumbnails.js [--brand all|personal|textos|groundforce|stability|reyla|openclaw]
 *   node scripts/generate-thumbnails.js --id tx-001
 *   node scripts/generate-thumbnails.js --output ./thumbnails
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const OUT_DIR = path.join(__dirname, '..', 'thumbnails');
const SCRIPTS_FILE = path.join(__dirname, '..', 'data', 'scripts.json');
const W = 1280, H = 720;

// Brand palettes (Miami Synthwave)
const BRAND_CONFIG = {
  personal:    { primary: '#ff2d87', secondary: '#00f5ff', bg1: '#0a0015', bg2: '#1a0030', label: 'ROB GAUDET' },
  openclaw:    { primary: '#00f5ff', secondary: '#a855f7', bg1: '#070711', bg2: '#0d0d2a', label: 'OPENCLAW JOURNEY' },
  groundforce: { primary: '#4ade80', secondary: '#00f5ff', bg1: '#030d0a', bg2: '#0a1e10', label: 'GROUND FORCE' },
  stability:   { primary: '#00f5ff', secondary: '#a855f7', bg1: '#07070f', bg2: '#0d1525', label: 'STABILITY.ORG' },
  textos:      { primary: '#a855f7', secondary: '#ff2d87', bg1: '#0e0515', bg2: '#1a0a2e', label: 'TEXTOS.AI' },
  reyla:       { primary: '#fbbf24', secondary: '#ff2d87', bg1: '#100c00', bg2: '#201500', label: 'REYLA.AI' },
};

const DURATION_COLOR = {
  '15s': '#4ade80',
  '30s': '#00f5ff',
  '60s': '#fbbf24',
  '3min': '#ff2d87',
  '5min': '#a855f7',
  'text': '#7878a8',
};

const TYPE_EMOJI = {
  video: '▶',
  text: '✦',
  photo: '◈',
};

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let filterBrand = 'all';
let filterId = null;
let outDir = OUT_DIR;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--brand' && args[i+1]) filterBrand = args[++i];
  if (args[i] === '--id' && args[i+1]) filterId = args[++i];
  if (args[i] === '--output' && args[i+1]) outDir = path.resolve(args[++i]);
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// ── Load scripts ─────────────────────────────────────────────────────────────
const data = JSON.parse(fs.readFileSync(SCRIPTS_FILE, 'utf8'));
let scripts = data.scripts;
if (filterId) scripts = scripts.filter(s => s.id === filterId);
else if (filterBrand !== 'all') scripts = scripts.filter(s => s.brand === filterBrand);

// ── Check ImageMagick ─────────────────────────────────────────────────────────
function checkDeps() {
  try {
    execSync('convert --version', { stdio: 'pipe' });
    return true;
  } catch {
    console.error('❌ ImageMagick not found. Install with: sudo apt install imagemagick');
    return false;
  }
}

// ── Wrap text to fit width ────────────────────────────────────────────────────
function wrapText(text, maxCharsPerLine = 38) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

// ── Escape for ImageMagick label ──────────────────────────────────────────────
function imEscape(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''")
    .replace(/"/g, '\\"')
    .replace(/@/g, '\\@')
    .replace(/%/g, '%%');
}

// ── Generate one thumbnail ────────────────────────────────────────────────────
function generateThumbnail(script) {
  const cfg = BRAND_CONFIG[script.brand] || BRAND_CONFIG.personal;
  const durationColor = DURATION_COLOR[script.duration] || '#ffffff';
  const typeSymbol = TYPE_EMOJI[script.type] || '▶';

  // Wrap hook text
  const hookLines = wrapText(script.hook, 42);
  const hookText = hookLines.join('\n');
  const hookY = Math.max(180, 220 - (hookLines.length - 1) * 18);

  const outFile = path.join(outDir, `${script.id}.png`);

  // Build ImageMagick command
  // We draw: gradient bg, grid lines, brand bar top, hook text, brand label, duration badge, hook formula tag
  const cmd = [
    'convert',
    `-size ${W}x${H}`,

    // Base gradient background
    `gradient:'${cfg.bg1}'-'${cfg.bg2}'`,

    // Vertical grid lines (subtle)
    '-fill', 'none',
    '-stroke', `'${cfg.primary}18'`,
    '-strokewidth', '1',
    '-draw', `"line 213,0 213,${H}"`,
    '-draw', `"line 426,0 426,${H}"`,
    '-draw', `"line 640,0 640,${H}"`,
    '-draw', `"line 854,0 854,${H}"`,
    '-draw', `"line 1067,0 1067,${H}"`,

    // Horizontal grid lines
    '-draw', `"line 0,144 ${W},144"`,
    '-draw', `"line 0,288 ${W},288"`,
    '-draw', `"line 0,432 ${W},432"`,
    '-draw', `"line 0,576 ${W},576"`,

    // Top brand bar background
    '-fill', `'${cfg.primary}22'`,
    '-stroke', 'none',
    '-draw', `"rectangle 0,0 ${W},72"`,

    // Top accent line
    '-fill', 'none',
    '-stroke', `'${cfg.primary}'`,
    '-strokewidth', '3',
    '-draw', `"line 0,72 ${W},72"`,

    // Bottom bar background  
    '-fill', `'${cfg.secondary}18'`,
    '-stroke', 'none',
    '-draw', `"rectangle 0,${H-72} ${W},${H}"`,

    // Bottom accent line
    '-stroke', `'${cfg.secondary}'`,
    '-strokewidth', '2',
    '-draw', `"line 0,${H-72} ${W},${H-72}"`,

    // Left accent stripe
    '-stroke', 'none',
    '-fill', `'${cfg.primary}'`,
    '-draw', `"rectangle 0,0 8,${H}"`,

    // Glow blob center-left (simulated with large soft circle)
    '-fill', `'${cfg.primary}12'`,
    '-draw', `"circle 320,360 320,580"`,

    // Brand label top
    '-font', 'DejaVu-Sans-Bold',
    '-pointsize', '28',
    '-fill', `'${cfg.primary}'`,
    '-annotate', '+40+48', `'${imEscape(cfg.label)}'`,

    // Platform tag top right
    '-pointsize', '22',
    '-fill', `'${cfg.secondary}'`,
    '-annotate', `+${W - 200}+48`, `'${imEscape(script.platform.toUpperCase())}'`,

    // HOOK text (main headline) — large, white, left-aligned
    '-font', 'DejaVu-Sans-Bold',
    '-pointsize', '52',
    '-fill', "'#f0f0ff'",
    // shadow first
    '-fill', "'#00000066'",
    '-annotate', `+43+${hookY + 3}`, `'${imEscape(hookText)}'`,
    // actual text
    '-fill', "'#f0f0ff'",
    '-annotate', `+40+${hookY}`, `'${imEscape(hookText)}'`,

    // Type symbol
    '-pointsize', '36',
    '-fill', `'${cfg.primary}'`,
    '-annotate', `+40+${H - 30}`, `'${typeSymbol} ${imEscape(script.type.toUpperCase())}'`,

    // Duration badge
    '-pointsize', '30',
    '-fill', `'${durationColor}'`,
    '-annotate', `+${W - 200}+${H - 30}`, `'⏱ ${imEscape(script.duration)}'`,

    // Hook formula watermark (subtle, bottom center)
    '-pointsize', '18',
    '-fill', "'#ffffff30'",
    '-annotate', `+${W/2 - 200}+${H - 12}`, "'INTERRUPT · DISSONANCE · OPEN LOOP'",

    // Script ID (very subtle, bottom right)
    '-pointsize', '16',
    '-fill', "'#ffffff20'",
    '-annotate', `+${W - 120}+${H - 12}`, `'${imEscape(script.id)}'`,

    `'${outFile}'`
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe' });
    return { success: true, file: outFile };
  } catch (err) {
    return { success: false, error: err.stderr?.toString() || err.message };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  if (!checkDeps()) process.exit(1);

  console.log(`\n🎨 Generating ${scripts.length} thumbnail(s) → ${outDir}\n`);
  
  let ok = 0, fail = 0;
  for (const script of scripts) {
    process.stdout.write(`  [${script.id}] ${script.brand_label} — "${script.hook.slice(0, 50)}..." `);
    const result = generateThumbnail(script);
    if (result.success) {
      console.log(`✅`);
      ok++;
    } else {
      console.log(`❌\n    ${result.error}`);
      fail++;
    }
  }

  console.log(`\n✅ Done: ${ok} generated, ${fail} failed`);
  console.log(`📁 Output: ${outDir}\n`);

  // Write manifest
  const manifest = {
    generated: new Date().toISOString(),
    count: ok,
    thumbnails: scripts
      .filter((_, i) => i < ok)
      .map(s => ({
        id: s.id,
        brand: s.brand,
        platform: s.platform,
        duration: s.duration,
        hook: s.hook,
        file: `${s.id}.png`
      }))
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('📋 Manifest written to thumbnails/manifest.json\n');
}

main();
