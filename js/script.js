/* ============================================================
   MARCHEL SCHEDULE — Main Script
   Repo: marchel-cc/marchel-website (GitHub Pages)
   Loads schedule.json and renders the weekly schedule,
   rotation games, MSN-style profile pic, and game logos.
   ============================================================ */

'use strict';

// ── CONFIG ───────────────────────────────────────────────────
const CHILE_TZ = 'America/Santiago';

// ── Day name → JS getDay() index (0=Sunday)
const DAY_TO_INDEX = {
  'Domingo': 0, 'Lunes': 1, 'Martes': 2,
  'Miércoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6
};

// ── Tag → CSS class map
const TAG_CLASS_MAP = {
  'Stream Longo': 'tag-stream-longo',
  'Stream Shorti':'tag-stream-shorti',
  'Colab':        'tag-colab',
  'Nuevo Video':  'tag-video',
  'Off':          'tag-off',
};

// ── TIMEZONE HELPERS ─────────────────────────────────────────
function getUserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function convertChileTimeToLocal(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);

  const now = new Date();

  // Obtener fecha actual en Chile
  const chileNow = new Date(
      now.toLocaleString('en-US', { timeZone: CHILE_TZ })
  );

  chileNow.setHours(hours, minutes, 0, 0);

  // Convertir a hora local del usuario
  return new Date(chileNow.toLocaleString('en-US'));
}

// ── Fetch schedule data ──────────────────────────────────────
async function loadSchedule() {
  try {
    const res = await fetch('data/schedule.json?nocache=' + Date.now());
    if (!res.ok) throw new Error('No se pudo cargar schedule.json');
    return await res.json();
  } catch (err) {
    console.error('Error cargando horario:', err);
    return null;
  }
}

// ── Profile Pic ──────────────────────────────────────────────
function renderProfilePic(profilePic, vtuberName) {
  const frame    = document.getElementById('profile-pic-frame');
  const fallback = document.getElementById('profile-pic-fallback');
  const nameEl   = document.getElementById('msn-display-name');
  const heroName = document.getElementById('hero-name');

  if (nameEl && vtuberName) {
    nameEl.textContent = `${vtuberName} ✦ Online`;
  }
  if (heroName && vtuberName) {
    heroName.textContent = vtuberName;
  }

  if (!frame) return;

  if (profilePic && profilePic.trim() && !profilePic.includes('your-profile-pic')) {
    const img = document.createElement('img');
    img.alt = vtuberName || 'VTuber';
    img.src = profilePic;
    img.style.display = 'none';

    img.onload = () => {
      if (fallback) fallback.style.display = 'none';
      img.style.display = 'block';
    };
    img.onerror = () => {
      img.remove();
    };

    frame.appendChild(img);

    const dot = document.createElement('div');
    dot.className = 'msn-status';
    frame.appendChild(dot);
  }
}

// ── Schedule (CONVERTED TIMES) ───────────────────────────────
function renderSchedule(schedule) {
  const tbody = document.getElementById('schedule-body');
  if (!tbody) return;

  const todayIndex = new Date().getDay();
  tbody.innerHTML = '';

  schedule.forEach(item => {
    const tr       = document.createElement('tr');
    const dayIndex = DAY_TO_INDEX[item.day] ?? -1;
    const tagClass = TAG_CLASS_MAP[item.tag] || 'tag-stream';

    if (!item.active) tr.classList.add('inactive');
    if (dayIndex === todayIndex && item.active) tr.classList.add('today');

    let formattedTime = '-';

    if (item.time != null) {
      const localDate = convertChileTimeToLocal(item.time);

      formattedTime =
          String(localDate.getHours()).padStart(2, '0') + ':' +
          String(localDate.getMinutes()).padStart(2, '0');
    }
    const hasLogo = item.imageUrl && item.imageUrl.trim() && !item.imageUrl.includes('your-');
    const gameCell = hasLogo
        ? `<div class="game-logo-wrap">
           <img class="game-logo"
                src="${item.imageUrl}"
                alt="${item.game}"
                onerror="this.style.display='none'" />
           <span>${item.game}</span>
         </div>`
        : `<span>${item.game}</span>`;

    tr.innerHTML = `
      <td class="td-day">${item.day}</td>
      <td class="td-time">${formattedTime}</td>
      <td class="td-game">${gameCell}</td>
      <td class="td-tag"><span class="tag ${tagClass}">${item.tag}</span></td>
    `;

    tbody.appendChild(tr);
  });
}

// ── Rotation ─────────────────────────────────────────────────
function renderRotation(games) {
  const grid = document.getElementById('rotation-grid');
  if (!grid) return;

  grid.innerHTML = '';

  games.forEach(game => {
    const card = document.createElement('div');
    card.className = 'game-card';

    const hasLogo = game.imageUrl && game.imageUrl.trim() && !game.imageUrl.includes('your-');
    const logoHtml = hasLogo
        ? `<img class="game-card-logo"
              src="${game.imageUrl}"
              alt="${game.name}"
              onerror="this.outerHTML='<span class=\\'game-card-emoji-fallback\\'>${game.emoji}</span>'" />`
        : `<span class="game-card-emoji-fallback">${game.emoji}</span>`;

    card.innerHTML = `
      ${logoHtml}
      <div class="game-name">${game.name}</div>
      <div class="game-note">${game.note}</div>
    `;
    grid.appendChild(card);
  });
}

// ── Socials ──────────────────────────────────────────────────
function renderSocials(socials) {
  const row = document.getElementById('social-row');
  if (!row || !socials) return;

  const platforms = [
    { key: 'twitch',  label: '🟣 Twitch',  cls: 'badge-twitch' },
    { key: 'youtube', label: '🔴 YouTube', cls: 'badge-yt' },
    { key: 'twitter', label: '🐦 Twitter', cls: 'badge-twitter' },
    { key: 'bsky',    label: '🦋 BlueSky', cls: 'badge-bsky' },
  ];

  row.innerHTML = '';
  platforms.forEach(p => {
    if (!socials[p.key]) return;
    const a = document.createElement('a');
    a.href      = socials[p.key];
    a.target    = '_blank';
    a.rel       = 'noopener';
    a.className = `social-badge ${p.cls}`;
    a.textContent = p.label;
    row.appendChild(a);
  });
}

// ── Twitch Embed ──
function setupTwitchEmbed() {
  const iframe = document.getElementById('twitch-embed');
  if (!iframe) return;

  const channel = 'marchel_cc';
  let parentDomain = window.location.hostname;

  // Si es localhost o 127.0.0.1, usar 'localhost'
  if (parentDomain === 'localhost' || parentDomain === '127.0.0.1') {
    parentDomain = 'localhost';
  }

  // Para GitHub Pages, el hostname será 'marchel-cc.github.io' (o tu dominio)
  const embedUrl = `https://player.twitch.tv/?channel=${channel}&parent=${parentDomain}&autoplay=false&muted=false`;

  iframe.src = embedUrl;
}

// ── YouTube Embed (último video) ──
function setupYoutubeEmbed(videoId) {
  const iframe = document.getElementById('youtube-embed');
  if (!iframe || !videoId) return;

  // Construir la URL del embed con el ID del último video
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=0&modestbranding=1&rel=0`;
  iframe.src = embedUrl;
}

// ── YouTube VOD Embed (último VOD) ──
function setupYoutubeVODEmbed(vodId) {
  const iframe = document.getElementById('youtube-vod-embed');
  if (!iframe || !vodId) return;

  // Construir la URL del embed con el ID del último video
  const embedUrl = `https://www.youtube.com/embed/${vodId}?autoplay=0&modestbranding=1&rel=0`;
  iframe.src = embedUrl;
}

// ── Meta ─────────────────────────────────────────────────────
function renderMeta(data) {
  const tagEl = document.getElementById('hero-tagline');
  if (tagEl && data.tagline) tagEl.textContent = data.tagline;

  const updEl = document.getElementById('last-updated');
  if (updEl && data.lastUpdated) {
    updEl.textContent = `📅 Actualizado: ${data.lastUpdated}`;
  }

  const countEl = document.getElementById('stream-count');
  if (countEl && data.schedule) {
    const active = data.schedule.filter(s => s.active && s.tag !== 'Off').length;
    countEl.textContent = `${active} streams esta semana`;
  }

  // 🌍 Mostrar zona horaria del usuario
  const tzEl = document.getElementById('timezone-label');
  if (tzEl) {
    tzEl.textContent = `🌍 Horario en tu zona (${getUserTimezone()})`;
  }
}

// ── Clock (LOCAL USER TIME) ──────────────────────────────────
function startClock() {
  const clockEl = document.getElementById('taskbar-clock');
  if (!clockEl) return;

  function tick() {
    const now = new Date();
    clockEl.textContent =
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0');
  }

  tick();
  setInterval(tick, 30000);
}

// ── Animations ───────────────────────────────────────────────
function animateRows() {
  const rows = document.querySelectorAll('#schedule-body tr');
  rows.forEach((row, i) => {
    row.style.opacity   = '0';
    row.style.transform = 'translateX(-12px)';
    row.style.transition = `opacity 0.3s ${i * 55}ms, transform 0.3s ${i * 55}ms`;
    requestAnimationFrame(() => {
      row.style.opacity   = '';
      row.style.transform = '';
    });
  });
}

// ── Window buttons ───────────────────────────────────────────
function initWindowButtons() {
  document.querySelectorAll('.xp-btn-close').forEach(btn => {
    btn.addEventListener('click', e => {
      const win = e.target.closest('.xp-window');
      if (win) {
        win.style.transition = 'transform 0.2s, opacity 0.2s';
        win.style.transform  = 'scale(0.95)';
        win.style.opacity    = '0.5';
        setTimeout(() => {
          win.style.transform = '';
          win.style.opacity   = '';
        }, 300);
      }
    });
  });
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  const data = await loadSchedule();

  if (!data) {
    const tbody = document.getElementById('schedule-body');
    if (tbody) {
      tbody.innerHTML = `
        <tr><td colspan="4" style="text-align:center;padding:20px;color:#c00;">
          ⚠️ No se pudo cargar schedule.json
        </td></tr>`;
    }
    return;
  }

  renderProfilePic(data.profilePic, data.vtuber);
  renderMeta(data);
  renderSchedule(data.schedule || []);
  renderRotation(data.rotationGames || []);
  renderSocials(data.socials || {});
  setupYoutubeEmbed(data.youtubeLatestVideoId);
  setupYoutubeVODEmbed(data.youtubeLatestVODId);

  setTimeout(animateRows, 100);
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  init();
  startClock();
  initWindowButtons();
  setupTwitchEmbed();
});