/* ============================================================
   INKTHORN Dashboard — app.js
   Fetches manifest, builds nav tabs, renders panels.
   ============================================================ */

'use strict';

// ── Genre Badge Helpers ────────────────────────────────────────

const GENRE_CLASS_MAP = {
  'Jazz':             'genre-jazz',
  'Brass':            'genre-brass',
  'Funk':             'genre-funk',
  'Rock':             'genre-rock',
  'Blues':            'genre-blues',
  'Zydeco':           'genre-zydeco',
  'Cajun':            'genre-cajun',
  'World':            'genre-world',
  'Electronic':       'genre-electronic',
  'Soul':             'genre-soul',
  'R&B':              'genre-rb',
  'Reggae':           'genre-reggae',
  'Singer-Songwriter':'genre-singer',
  'Other':            'genre-other',
};

function genreBadge(genre) {
  const cls = GENRE_CLASS_MAP[genre] || 'genre-other';
  return `<span class="genre-badge ${cls}">${escHtml(genre)}</span>`;
}

// ── Utilities ──────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(isoString) {
  if (!isoString) return null;
  const then = new Date(isoString);
  if (isNaN(then)) return null;
  const diffMs = Date.now() - then.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatTimestamp(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZoneName: 'short'
  });
}

// ── Renderers ──────────────────────────────────────────────────

/**
 * renderLiveMusic — groups shows into Afternoon / Evening / Night buckets,
 * renders each as a section with time-sorted show cards.
 */
function renderLiveMusic(data, el) {
  const shows = (data.shows || []).slice().sort((a, b) => {
    // Normalize time_sort: times after midnight (0000–0559) sort after 2359
    const norm = t => (t < 600 ? t + 2400 : t);
    return norm(a.time_sort) - norm(b.time_sort);
  });

  if (!shows.length) {
    el.innerHTML = pendingCard('No shows found in data.', '📭');
    return;
  }

  // Current time as a sort-comparable number (e.g. 14:35 → 1435)
  const now = new Date();
  const nowSort = now.getHours() * 100 + now.getMinutes();
  const normNow = nowSort < 600 ? nowSort + 2400 : nowSort;

  // Find the first show at or after now
  const firstUpcomingIdx = shows.findIndex(s => {
    const norm = s.time_sort < 600 ? s.time_sort + 2400 : s.time_sort;
    return norm >= normNow;
  });

  const afternoon = shows.filter(s => s.time_sort >= 1100 && s.time_sort < 1800);
  const evening   = shows.filter(s => s.time_sort >= 1800 && s.time_sort < 2100);
  const night     = shows.filter(s => s.time_sort >= 2100 || s.time_sort < 600);

  // Build stats
  const remaining = firstUpcomingIdx === -1 ? 0 : shows.length - firstUpcomingIdx;
  const nextShow  = firstUpcomingIdx !== -1 ? shows[firstUpcomingIdx] : null;
  const topGenres = {};
  shows.forEach(s => { topGenres[s.genre] = (topGenres[s.genre] || 0) + 1; });
  const topGenre  = Object.entries(topGenres).sort((a,b) => b[1]-a[1])[0];

  const statsHtml = `
    <div class="stats-row-wrapper"><div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${shows.length}</div>
        <div class="stat-label">Tonight's Shows</div>
      </div>
      <div class="stat-card stat-card-highlight">
        <div class="stat-value stat-value-sm">${nextShow ? escHtml(nextShow.artist) : 'All done'}</div>
        <div class="stat-label">${nextShow ? '▶ Up Next · ' + escHtml(nextShow.time) : 'No more shows'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${remaining}</div>
        <div class="stat-label">Shows Remaining</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-sm">${topGenre ? escHtml(topGenre[0]) : '—'}</div>
        <div class="stat-label">${topGenre ? `Top Genre · ${topGenre[1]} shows` : 'Genre data'}</div>
      </div>
    </div></div>`;

  let html = statsHtml + `<p class="show-count-summary">Showing <span>${shows.length}</span> performances · ${escHtml(data.date)}</p>`;

  // Inject a "NOW" marker before the first upcoming show
  let nowMarkerId = null;
  let nowMarkerInserted = false;

  const renderGroup = (label, groupShows) => {
    if (!groupShows.length) return '';
    let cards = groupShows.map(show => {
      const showIdx = shows.indexOf(show);
      const neighborhood = show.neighborhood ? `<span class="show-neighborhood">${escHtml(show.neighborhood)}</span>` : '';

      // Insert NOW marker before the first upcoming show
      let nowMarker = '';
      if (!nowMarkerInserted && firstUpcomingIdx !== -1 && showIdx === firstUpcomingIdx) {
        nowMarkerId = 'now-marker';
        nowMarker = `<div id="now-marker" class="now-marker"><span class="now-marker-line"></span><span class="now-marker-label">▶ NOW</span><span class="now-marker-line"></span></div>`;
        nowMarkerInserted = true;
      }

      return `${nowMarker}
        <div class="card${showIdx === firstUpcomingIdx ? ' card-next-up' : ''}">
          <div class="show-card">
            <div class="show-time">${escHtml(show.time)}</div>
            <div class="show-artist">${escHtml(show.artist)}</div>
            <div class="show-genre">${genreBadge(show.genre)}</div>
            <div class="show-venue-block">
              <span class="show-venue">${escHtml(show.venue)}</span>
              ${neighborhood}
            </div>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="time-group">
        <h3 class="time-group-header">
          ${escHtml(label)}
          <span class="time-group-count">${groupShows.length} show${groupShows.length !== 1 ? 's' : ''}</span>
        </h3>
        ${cards}
      </div>`;
  };

  html += renderGroup('Afternoon', afternoon);
  html += renderGroup('Evening', evening);
  html += renderGroup('Night', night);

  el.innerHTML = html;

  // Scroll to NOW marker after a short delay (let layout settle)
  if (nowMarkerId) {
    setTimeout(() => {
      const marker = document.getElementById(nowMarkerId);
      if (marker) {
        marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 400);
  }
}

/**
 * renderWeather — shows current conditions prominently, then 3-day forecast cards.
 */
function renderWeather(data, el) {
  if (!data || data.status === 'pending') {
    el.innerHTML = `<div class="no-data-card"><span class="no-data-icon">🌤️</span><p>No weather data yet — agent hasn't published.</p></div>`;
    return;
  }

  const c = data.current;
  const html = `
    <div class="card weather-current">
      <div class="weather-main">
        <span class="weather-emoji">${c.emoji}</span>
        <div class="weather-temps">
          <span class="weather-temp">${c.temp_f}°F</span>
          <span class="weather-feels">Feels like ${c.feels_like_f}°F</span>
        </div>
        <div class="weather-desc-block">
          <span class="weather-description">${c.description}</span>
          <span class="weather-location">📍 ${data.location}</span>
        </div>
      </div>
      <div class="weather-details">
        <span>💧 Humidity: ${c.humidity}%</span>
        <span>💨 Wind: ${c.wind_mph} mph ${c.wind_dir}</span>
        <span>👁️ Visibility: ${c.visibility_miles} mi</span>
        <span>☀️ UV Index: ${c.uv_index}</span>
      </div>
    </div>
    <div class="weather-forecast">
      ${(data.forecast || []).map(day => `
        <div class="card weather-day">
          <div class="forecast-label">${day.label}</div>
          <div class="forecast-emoji">${day.emoji}</div>
          <div class="forecast-temps">${day.high_f}° / ${day.low_f}°</div>
          <div class="forecast-desc">${day.description}</div>
          <div class="forecast-rain">🌧️ ${day.chance_of_rain}%</div>
          <div class="forecast-sun">🌅 ${day.sunrise} · 🌇 ${day.sunset}</div>
        </div>
      `).join('')}
    </div>
  `;
  el.innerHTML = html;
}

/**
 * renderPlaybook — renders notes and structured items from the playbook.
 */
function renderPlaybook(data, el) {
  if (!data || data.status === 'pending') {
    el.innerHTML = `<div class="no-data-card"><span class="no-data-icon">📋</span><p>No playbook data yet — agent hasn't published.</p></div>`;
    return;
  }

  const allItems = [];

  // Add notes from the notes array
  if (data.notes && data.notes.length > 0) {
    data.notes.forEach(note => {
      allItems.push({
        timestamp: note.timestamp,
        type: 'note',
        category: 'note',
        title: '📝 Note',
        body: note.text,
        source: note.source || 'telegram'
      });
    });
  }

  // Add structured items
  if (data.items && data.items.length > 0) {
    data.items.forEach(item => allItems.push(item));
  }

  if (allItems.length === 0) {
    el.innerHTML = `<div class="no-data-card"><span class="no-data-icon">📋</span><p>Your playbook is empty — text me a note on Telegram to get started!</p></div>`;
    return;
  }

  // Sort by timestamp descending (newest first)
  allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Stats
  const totalItems = allItems.length;
  const todayItems = allItems.filter(i => {
    const d = new Date(i.timestamp);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  const cats = {};
  allItems.forEach(i => { cats[i.category] = (cats[i.category] || 0) + 1; });
  const topCat = Object.entries(cats).sort((a,b) => b[1]-a[1])[0];
  const latest = allItems[0];
  const latestTime = latest ? new Date(latest.timestamp).toLocaleString('en-US', {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}) : '—';

  const playbookStats = `
    <div class="stats-row-wrapper"><div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${totalItems}</div>
        <div class="stat-label">Total Items</div>
      </div>
      <div class="stat-card stat-card-highlight">
        <div class="stat-value">${todayItems}</div>
        <div class="stat-label">Added Today</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-sm">${topCat ? escHtml(topCat[0]) : '—'}</div>
        <div class="stat-label">${topCat ? `Top Category · ${topCat[1]}` : 'Category'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-sm">${escHtml(latestTime)}</div>
        <div class="stat-label">Latest Entry</div>
      </div>
    </div></div>`;

  const categoryColors = {
    note: 'var(--cyan)',
    system: 'var(--purple)',
    briefing: 'var(--pink)',
    reminder: '#f59e0b',
    default: 'var(--purple)'
  };

  const html = playbookStats + allItems.map(item => {
    const color = categoryColors[item.category] || categoryColors.default;
    const time = new Date(item.timestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      hour12: true
    });
    return `
      <div class="card playbook-card">
        <div class="playbook-header">
          <span class="playbook-title" style="color: ${color}">${item.title || 'Note'}</span>
          <span class="playbook-time">${time}</span>
        </div>
        <p class="playbook-body">${item.body}</p>
        ${item.source ? `<span class="playbook-source">via ${item.source}</span>` : ''}
      </div>
    `;
  }).join('');

  el.innerHTML = html;
}

/**
 * renderSchedule — renders scheduled tasks with stat summary + task cards.
 */
function renderSchedule(data, el) {
  if (!data || !data.tasks || data.tasks.length === 0) {
    el.innerHTML = `<div class="no-data-card"><span class="no-data-icon">⚙️</span><p>No scheduled tasks yet.</p></div>`;
    return;
  }

  const tasks = data.tasks;
  const active = tasks.filter(t => t.status === 'active').length;
  const byCategory = {};
  tasks.forEach(t => { byCategory[t.category] = (byCategory[t.category] || 0) + 1; });
  const topCat = Object.entries(byCategory).sort((a,b) => b[1]-a[1])[0];

  const categoryColors = {
    wellness:  'var(--pink)',
    dashboard: 'var(--cyan)',
    reminder:  '#fbbf24',
    default:   'var(--purple)',
  };

  const categoryIcons = {
    wellness:  '💚',
    dashboard: '📊',
    reminder:  '⏰',
    default:   '⚙️',
  };

  const statsHtml = `
    <div class="stats-row-wrapper"><div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${tasks.length}</div>
        <div class="stat-label">Total Tasks</div>
      </div>
      <div class="stat-card stat-card-highlight">
        <div class="stat-value">${active}</div>
        <div class="stat-label">Active Now</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-sm">${topCat ? escHtml(topCat[0]) : '—'}</div>
        <div class="stat-label">${topCat ? `Top Category · ${topCat[1]}` : 'Category'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-value-sm">${escHtml(data.updated ? new Date(data.updated).toLocaleDateString('en-US', {month:'short',day:'numeric'}) : '—')}</div>
        <div class="stat-label">Last Synced</div>
      </div>
    </div></div>`;

  // Group by category
  const grouped = {};
  tasks.forEach(t => {
    const cat = t.category || 'default';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  });

  let cardsHtml = '';
  for (const [cat, catTasks] of Object.entries(grouped)) {
    const color = categoryColors[cat] || categoryColors.default;
    const icon  = categoryIcons[cat]  || categoryIcons.default;
    cardsHtml += `
      <div class="time-group">
        <h3 class="time-group-header" style="color:${color};text-shadow:0 0 10px ${color}40;">
          ${icon} ${escHtml(cat.charAt(0).toUpperCase() + cat.slice(1))}
          <span class="time-group-count">${catTasks.length} task${catTasks.length !== 1 ? 's' : ''}</span>
        </h3>
        ${catTasks.map(t => {
          const color = categoryColors[t.category] || categoryColors.default;
          const statusDot = t.status === 'active'
            ? `<span class="schedule-status schedule-status-active">● ACTIVE</span>`
            : `<span class="schedule-status schedule-status-paused">● PAUSED</span>`;
          return `
            <div class="card">
              <div class="schedule-card">
                <div class="schedule-top">
                  <span class="schedule-title" style="color:${color}">${escHtml(t.title)}</span>
                  ${statusDot}
                </div>
                <div class="schedule-desc">${escHtml(t.description)}</div>
                <div class="schedule-meta">
                  <span class="schedule-when">🕐 ${escHtml(t.schedule)}</span>
                  ${t.next ? `<span class="schedule-next">▶ Next: ${escHtml(t.next)}</span>` : ''}
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }

  el.innerHTML = statsHtml + cardsHtml;
}

/**
 * renderGeneric — fallback JSON pretty-printer.
 */
function renderGeneric(data, el) {
  if (data.status === 'pending') {
    el.innerHTML = pendingCard(data.message || 'No data yet.', '🤖');
    return;
  }
  el.innerHTML = `<div class="card"><pre style="white-space:pre-wrap;word-break:break-all;font-size:0.75rem;color:var(--text-secondary);">${escHtml(JSON.stringify(data, null, 2))}</pre></div>`;
}

/**
 * pendingCard — standard "not yet available" card.
 */
function pendingCard(message, icon = '⏳') {
  return `
    <div class="card pending-card">
      <div class="card-inner">
        <div class="pending-icon">${icon}</div>
        <div class="pending-message">No data yet — agent hasn't published</div>
        <div class="pending-sub">${escHtml(message)}</div>
      </div>
    </div>`;
}

// ── Renderer Dispatch ──────────────────────────────────────────

const RENDERERS = {
  'live-music': renderLiveMusic,
  'weather':    renderWeather,
  'playbook':   renderPlaybook,
  'schedule':   renderSchedule,
};

function getRenderer(type) {
  return RENDERERS[type] || renderGeneric;
}

// ── Panel Builder ──────────────────────────────────────────────

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

async function loadPanel(panelConfig, panelEl) {
  const contentEl = panelEl.querySelector('.panel-content');
  const updatedEl = panelEl.querySelector('.last-updated');

  try {
    const data = await fetchJSON(panelConfig.data);

    // Update the "last updated" display
    if (updatedEl) {
      const ago = timeAgo(data.updated);
      if (ago) {
        updatedEl.textContent = `Updated ${ago}`;
        updatedEl.title = formatTimestamp(data.updated);
      } else if (data.updated === null || data.status === 'pending') {
        updatedEl.textContent = 'Not yet updated';
      } else {
        updatedEl.textContent = '';
      }
    }

    const renderer = getRenderer(panelConfig.type);
    renderer(data, contentEl);
  } catch (err) {
    const is404 = err.status === 404;
    contentEl.innerHTML = pendingCard(
      is404
        ? 'Data file not found. Agent may not have published yet.'
        : `Failed to load: ${escHtml(err.message)}`,
      is404 ? '📭' : '⚠️'
    );
    if (updatedEl) updatedEl.textContent = '';
  }
}

// ── App Init ───────────────────────────────────────────────────

async function init() {
  const navBar     = document.getElementById('nav-bar');
  const mainEl     = document.getElementById('main-content');
  const loadingEl  = document.getElementById('loading-state');
  const footerEl   = document.getElementById('footer-updated');

  let manifest;
  try {
    manifest = await fetchJSON('data/manifest.json');
  } catch (err) {
    if (loadingEl) {
      loadingEl.innerHTML = `
        <div class="pending-icon">⚠️</div>
        <div class="pending-message">Failed to load manifest</div>
        <div class="pending-sub">${escHtml(err.message)}</div>`;
    }
    return;
  }

  // Update footer timestamp
  if (footerEl && manifest.updated) {
    footerEl.textContent = `Last updated: ${formatTimestamp(manifest.updated)}`;
  }

  // Remove loading state
  if (loadingEl) loadingEl.remove();

  const panels = manifest.panels || [];
  if (!panels.length) {
    mainEl.innerHTML = pendingCard('No panels defined in manifest.', '📋');
    return;
  }

  // Build tabs + panels
  const tabEls   = [];
  const panelEls = [];

  panels.forEach((panelConfig, idx) => {
    // Nav tab
    const tab = document.createElement('button');
    tab.className = 'nav-tab' + (idx === 0 ? ' active' : '');
    tab.textContent = panelConfig.label;
    tab.setAttribute('role', 'tab');

    // Playbook panel: redirect to protected standalone page
    if (panelConfig.type === 'playbook') {
      tab.setAttribute('aria-label', `${panelConfig.label} (opens protected page)`);
      tab.addEventListener('click', () => {
        window.location.href = 'playbook.html';
      });
      navBar.appendChild(tab);
      tabEls.push(tab);
      // Push a null placeholder so indices stay aligned
      panelEls.push(null);
      return;
    }

    tab.setAttribute('aria-controls', `panel-${panelConfig.id}`);
    tab.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
    navBar.appendChild(tab);
    tabEls.push(tab);

    // Panel div
    const panel = document.createElement('section');
    panel.className = 'panel' + (idx === 0 ? ' active' : '');
    panel.id = `panel-${panelConfig.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.innerHTML = `
      <div class="panel-header">
        <div>
          <div class="panel-title">${escHtml(panelConfig.label)}</div>
          <div class="panel-description">${escHtml(panelConfig.description || '')}</div>
        </div>
        <div class="panel-meta">
          <span class="agent-badge">AGENT: ${escHtml(panelConfig.agent || 'Unknown')}</span>
          <span class="last-updated">Loading…</span>
        </div>
      </div>
      <div class="panel-content"></div>`;
    mainEl.appendChild(panel);
    panelEls.push(panel);

    // Tab click handler
    tab.addEventListener('click', () => {
      tabEls.forEach((t, i) => {
        t.classList.toggle('active', i === idx);
        t.setAttribute('aria-selected', i === idx ? 'true' : 'false');
      });
      panelEls.forEach((p, i) => {
        if (p) p.classList.toggle('active', i === idx);
      });
    });
  });

  // Load all panels concurrently (skip playbook — it has no panel div)
  panels.forEach((panelConfig, idx) => {
    if (panelConfig.type === 'playbook') return;
    if (panelEls[idx]) loadPanel(panelConfig, panelEls[idx]);
  });
}

document.addEventListener('DOMContentLoaded', init);
