/* ============================================================
   MARCHEL WEBSITE — js/script.js
   Repo: marchel-cc/marchel-website (GitHub Pages)

   Sections:
     1. Window Manager (WM)  — floating, draggable XP windows
     2. Data loading          — fetch schedule.json
     3. Rendering             — schedule, rotation, profile pic, socials
     4. Embed setup           — Twitch, YouTube
     5. Clock & meta
     6. Boot
   ============================================================ */

'use strict';

/* ════════════════════════════════════════════════════════════
   1. WINDOW MANAGER
   ════════════════════════════════════════════════════════════

   Each floating window is a <section class="xp-window" data-wid="...">
   The WM reads data-wid / data-title / data-icon from each element.

   Window states:  'closed'  →  hidden (display:none, no taskbar btn)
                   'open'    →  visible, positioned, focusable, draggable
                   'minimized' → hidden but still in taskbar

   On desktop (>768px): windows float as fixed overlays, are draggable.
   On mobile  (≤768px): CSS reverts everything to normal page flow —
                         the WM skips all positioning/drag logic.
*/

const WM = (() => {

  /* ── Default size for each window (px) ── */
  const DEFAULTS = {
    'hero':     { w: 440,  h: 500 },
    'schedule': { w: 680,  h: 480 },
    'rotation': { w: 680,  h: 400 },
    'stream':   { w: 900,  h: 560 },
    'yt':       { w: 900,  h: 560 },
    'yt-vod':   { w: 900,  h: 560 },
  };

  /* ── Per-window runtime state ── */
  // wins[wid] = { el, title, icon, state, x, y, w, h, savedGeom }
  const wins     = {};
  let   zTop     = 200;     // always-incrementing z-index counter
  let   focused  = null;    // currently focused wid
  let   cascade  = 0;       // offset counter for initial placement

  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  /* ────────────────────────────────────────────────────────
     INIT  — call once on DOMContentLoaded
     ──────────────────────────────────────────────────────── */
  function init() {
    /* Register every [data-wid] window */
    document.querySelectorAll('.xp-window[data-wid]').forEach(el => {
      const wid   = el.dataset.wid;
      const defs  = DEFAULTS[wid] || { w: 620, h: 460 };
      /* Allow per-element size overrides via data-w / data-h */
      const defW  = parseInt(el.dataset.w) || defs.w;
      const defH  = parseInt(el.dataset.h) || defs.h;

      wins[wid] = {
        el,
        title:     el.dataset.title || wid,
        icon:      el.dataset.icon  || '🪟',
        state:     'closed',
        x: null, y: null,
        w: defW, h: defH,
        savedGeom: null,
      };

      /* Title-bar buttons */
      el.querySelector('.xp-btn-close')
        ?.addEventListener('click', e => { e.stopPropagation(); close(wid); });
      el.querySelector('.xp-btn-min')
        ?.addEventListener('click', e => { e.stopPropagation(); minimize(wid); });
      el.querySelector('.xp-btn-max')
        ?.addEventListener('click', e => { e.stopPropagation(); toggleMax(wid); });

      /* Clicking anywhere on the window body brings it to front */
      el.addEventListener('mousedown', () => focus(wid), true);

      /* Drag handle = title bar */
      const titlebar = el.querySelector('.xp-titlebar');
      if (titlebar) attachDrag(wid, titlebar);
    });

    /* Desktop icon buttons */
    document.querySelectorAll('button.desktop-icon[data-open]').forEach(btn => {
      btn.addEventListener('click', () => open(btn.dataset.open));
    });

    /* Auto-open any window that has the data-autoopen attribute.
       Falls back to 'hero' if nothing is marked (safety net). */
    const autoOpenEls = document.querySelectorAll('.xp-window[data-wid][data-autoopen]');
    if (autoOpenEls.length > 0) {
      autoOpenEls.forEach(el => open(el.dataset.wid));
    } else if (wins['hero']) {
      open('hero');
    }
  }

  /* ────────────────────────────────────────────────────────
     OPEN  — open or restore a window
     ──────────────────────────────────────────────────────── */
  function open(wid) {
    const w = wins[wid];
    if (!w) return;

    if (w.state === 'open') {
      focus(wid);
      return;
    }

    /* First-time placement: cascade from centre of viewport */
    if (w.x === null && !isMobile()) {
      const vw = window.innerWidth;
      const vh = window.innerHeight - 36;  // subtract taskbar
      w.w = Math.min(w.w, vw - 60);
      w.h = Math.min(w.h, vh - 40);
      const cx = Math.round((vw - w.w) / 2) + cascade * 28;
      const cy = Math.round((vh - w.h) / 2) + cascade * 28;
      w.x = Math.max(0, Math.min(cx, vw - w.w - 8));
      w.y = Math.max(0, Math.min(cy, vh - w.h - 8));
      cascade = (cascade + 1) % 9;
    }

    w.state = 'open';
    applyGeom(wid);    // sets left/top/width/height
    w.el.classList.add('wm-open');
    focus(wid);
    updateTaskbar();
    syncIconState(wid);
  }

  /* ────────────────────────────────────────────────────────
     CLOSE
     ──────────────────────────────────────────────────────── */
  function close(wid) {
    const w = wins[wid];
    if (!w || w.state === 'closed') return;

    /* Quick scale-down animation */
    w.el.style.transition = 'opacity .12s, transform .12s';
    w.el.style.opacity    = '0';
    w.el.style.transform  = 'scale(0.9)';

    setTimeout(() => {
      w.el.style.cssText = '';          // clear all inline styles
      w.el.classList.remove('wm-open', 'wm-focused', 'wm-maximized');
      w.state = 'closed';
      if (focused === wid) focused = null;
      updateTaskbar();
      syncIconState(wid);
    }, 130);
  }

  /* ────────────────────────────────────────────────────────
     MINIMIZE
     ──────────────────────────────────────────────────────── */
  function minimize(wid) {
    const w = wins[wid];
    if (!w || w.state !== 'open') return;

    w.el.style.transition = 'opacity .1s, transform .1s';
    w.el.style.opacity    = '0';
    w.el.style.transform  = 'scale(0.88) translateY(16px)';

    setTimeout(() => {
      w.el.style.transition = '';
      w.el.style.opacity    = '';
      w.el.style.transform  = '';
      w.el.classList.remove('wm-open', 'wm-focused');
      w.state = 'minimized';
      if (focused === wid) focused = null;
      updateTaskbar();
    }, 110);
  }

  /* ────────────────────────────────────────────────────────
     TOGGLE MAXIMISE
     ──────────────────────────────────────────────────────── */
  function toggleMax(wid) {
    const w = wins[wid];
    if (!w || w.state !== 'open') return;

    if (w.el.classList.contains('wm-maximized')) {
      /* Restore */
      w.el.classList.remove('wm-maximized');
      if (w.savedGeom) {
        Object.assign(w, w.savedGeom);
        w.savedGeom = null;
      }
      applyGeom(wid);
    } else {
      /* Maximise */
      w.savedGeom = { x: w.x, y: w.y, w: w.w, h: w.h };
      w.el.classList.add('wm-maximized');
    }
    focus(wid);
  }

  /* ────────────────────────────────────────────────────────
     FOCUS  — bring window to front
     ──────────────────────────────────────────────────────── */
  function focus(wid) {
    const w = wins[wid];
    if (!w || w.state === 'closed') return;

    /* Un-focus previous */
    if (focused && focused !== wid && wins[focused]) {
      wins[focused].el.classList.remove('wm-focused');
    }

    w.el.classList.add('wm-focused');
    w.el.style.zIndex = ++zTop;
    focused = wid;
    updateTaskbar();
  }

  /* ────────────────────────────────────────────────────────
     APPLY GEOMETRY  — write left/top/width/height to style
     (skipped on mobile — CSS controls layout there)
     ──────────────────────────────────────────────────────── */
  function applyGeom(wid) {
    if (isMobile()) return;
    const w = wins[wid];
    if (!w || w.el.classList.contains('wm-maximized')) return;
    w.el.style.left   = w.x + 'px';
    w.el.style.top    = w.y + 'px';
    w.el.style.width  = w.w + 'px';
    w.el.style.height = w.h + 'px';
  }

  /* ────────────────────────────────────────────────────────
     DRAG  — attach mouse/touch drag to a window's title bar
     ──────────────────────────────────────────────────────── */
  function attachDrag(wid, titlebar) {
    const cover = document.getElementById('wm-drag-cover');
    let dragging = false;
    let ox, oy, startX, startY;   // origin mouse + origin window coords

    /* ── Mouse ── */
    titlebar.addEventListener('mousedown', e => {
      if (e.target.closest('.xp-window-btns')) return;  // ignore buttons
      if (isMobile()) return;
      const w = wins[wid];
      if (!w || w.el.classList.contains('wm-maximized')) return;

      dragging = true;
      ox = e.clientX;  oy = e.clientY;
      startX = w.x;    startY = w.y;

      if (cover) cover.style.display = 'block';   // block iframes
      focus(wid);
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      moveWindow(wid, e.clientX - ox, e.clientY - oy, startX, startY);
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      if (cover) cover.style.display = 'none';
    });

    /* ── Touch (tablets / touch-screen desktops) ── */
    titlebar.addEventListener('touchstart', e => {
      if (e.target.closest('.xp-window-btns')) return;
      if (isMobile()) return;
      const w = wins[wid];
      if (!w || w.el.classList.contains('wm-maximized')) return;

      const t = e.touches[0];
      dragging = true;
      ox = t.clientX;  oy = t.clientY;
      startX = w.x;    startY = w.y;
      focus(wid);
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!dragging) return;
      const t = e.touches[0];
      moveWindow(wid, t.clientX - ox, t.clientY - oy, startX, startY);
    }, { passive: true });

    document.addEventListener('touchend', () => { dragging = false; });
  }

  /* Shared move logic — clamps window so it can't go fully off-screen */
  function moveWindow(wid, dx, dy, startX, startY) {
    const w  = wins[wid];
    if (!w) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight - 36;

    /* Allow dragging partially off-screen but keep ≥80px visible */
    w.x = Math.max(-(w.w - 80), Math.min(startX + dx, vw - 80));
    w.y = Math.max(0,            Math.min(startY + dy, vh - 30));

    w.el.style.left = w.x + 'px';
    w.el.style.top  = w.y + 'px';
  }

  /* ────────────────────────────────────────────────────────
     TASKBAR  — rebuild the #taskbar-windows button strip
     ──────────────────────────────────────────────────────── */
  function updateTaskbar() {
    const bar = document.getElementById('taskbar-windows');
    if (!bar) return;
    bar.innerHTML = '';

    Object.entries(wins).forEach(([wid, w]) => {
      if (w.state === 'closed') return;

      const btn = document.createElement('button');
      btn.className   = 'win-task-btn';
      btn.title       = w.title;
      btn.innerHTML   =
        `<span>${w.icon}</span><span class="btn-label">${w.title}</span>`;

      if (w.state === 'minimized')       btn.classList.add('wm-minimized');
      if (wid === focused && w.state === 'open') btn.classList.add('wm-focused');

      btn.addEventListener('click', () => {
        if (w.state === 'minimized') {
          /* Restore minimized window */
          w.state = 'open';
          applyGeom(wid);
          w.el.classList.add('wm-open');
          focus(wid);
          updateTaskbar();
          syncIconState(wid);
        } else if (wid === focused) {
          /* Click on the focused window's button → minimize it */
          minimize(wid);
        } else {
          focus(wid);
        }
      });

      bar.appendChild(btn);
    });
  }

  /* ────────────────────────────────────────────────────────
     ICON STATE SYNC  — highlight desktop icon when its window is open
     ──────────────────────────────────────────────────────── */
  function syncIconState(wid) {
    const btn = document.querySelector(`button.desktop-icon[data-open="${wid}"]`);
    if (!btn) return;
    const isOpen = wins[wid]?.state !== 'closed';
    btn.classList.toggle('icon-active', isOpen);
  }

  /* Public API */
  return { init, open, close, minimize, focus };

})(); /* end WM */


/* ════════════════════════════════════════════════════════════
   2. CONFIG & HELPERS
   ════════════════════════════════════════════════════════════ */

const CHILE_TZ = 'America/Santiago';

const DAY_TO_INDEX = {
  'Domingo': 0, 'Lunes': 1, 'Martes': 2,
  'Miércoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6,
};

const TAG_CLASS_MAP = {
  'Stream Longo':  'tag-stream-longo',
  'Stream Shorti': 'tag-stream-shorti',
  'Colab':         'tag-colab',
  'Nuevo Video':   'tag-video',
  'Off':           'tag-off',
};

function getUserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/* Convert a Chile clock time (HH:MM string) to the user's local time */
function convertChileTimeToLocal(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now       = new Date();
  const chileNow  = new Date(now.toLocaleString('en-US', { timeZone: CHILE_TZ }));
  chileNow.setHours(hours, minutes, 0, 0);
  return new Date(chileNow.toLocaleString('en-US'));
}


/* ════════════════════════════════════════════════════════════
   3. DATA LOADING
   ════════════════════════════════════════════════════════════ */

async function loadSchedule() {
  try {
    const res = await fetch('data/schedule.json?nocache=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.error('Error cargando schedule.json:', err);
    return null;
  }
}


/* ════════════════════════════════════════════════════════════
   4. RENDERING
   ════════════════════════════════════════════════════════════ */

/* ── Profile pic (MSN / XP account-picture style) ── */
function renderProfilePic(profilePic, vtuberName) {
  const frame    = document.getElementById('profile-pic-frame');
  const fallback = document.getElementById('profile-pic-fallback');
  const nameEl   = document.getElementById('msn-display-name');
  const heroName = document.getElementById('hero-name');

  if (nameEl   && vtuberName) nameEl.textContent   = `${vtuberName} ✦ Online`;
  if (heroName && vtuberName) heroName.textContent  = vtuberName;
  if (!frame) return;

  if (profilePic && profilePic.trim() && !profilePic.includes('your-profile-pic')) {
    const img   = document.createElement('img');
    img.alt     = vtuberName || 'VTuber';
    img.src     = profilePic;
    img.style.display = 'none';
    img.onload  = () => { if (fallback) fallback.style.display = 'none'; img.style.display = 'block'; };
    img.onerror = () => img.remove();
    frame.appendChild(img);

    const dot = document.createElement('div');
    dot.className = 'msn-status';
    frame.appendChild(dot);
  }
}

/* ── Weekly schedule table ── */
function renderSchedule(schedule) {
  const tbody = document.getElementById('schedule-body');
  if (!tbody) return;

  const todayIndex = new Date().getDay();   // 0 = Sunday
  tbody.innerHTML  = '';

  schedule.forEach(item => {
    const tr       = document.createElement('tr');
    const dayIndex = DAY_TO_INDEX[item.day] ?? -1;
    const tagClass = TAG_CLASS_MAP[item.tag] || 'tag-stream-longo';

    if (!item.active)                           tr.classList.add('inactive');
    if (dayIndex === todayIndex && item.active) tr.classList.add('today');

    /* Convert Chile time to user's local time */
    let formattedTime = '—';
    if (item.time != null) {
      const local = convertChileTimeToLocal(item.time);
      formattedTime =
        String(local.getHours()).padStart(2, '0') + ':' +
        String(local.getMinutes()).padStart(2, '0');
    }

    /* Game logo if an imgur URL is provided */
    const hasLogo = item.imageUrl && item.imageUrl.trim() && !item.imageUrl.includes('your-');
    const gameCell = hasLogo
      ? `<div class="game-logo-wrap">
           <img class="game-logo" src="${item.imageUrl}" alt="${item.game}"
                onerror="this.style.display='none'">
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

/* ── Rotation games grid ── */
function renderRotation(games) {
  const grid = document.getElementById('rotation-grid');
  if (!grid) return;
  grid.innerHTML = '';

  games.forEach(game => {
    const card     = document.createElement('div');
    card.className = 'game-card';

    const hasLogo  = game.imageUrl && game.imageUrl.trim() && !game.imageUrl.includes('your-');
    const logoHtml = hasLogo
      ? `<img class="game-card-logo" src="${game.imageUrl}" alt="${game.name}"
              onerror="this.outerHTML='<span class=\\'game-card-emoji-fallback\\'>${game.emoji}</span>'">`
      : `<span class="game-card-emoji-fallback">${game.emoji}</span>`;

    card.innerHTML = `
      ${logoHtml}
      <div class="game-name">${game.name}</div>
      <div class="game-note">${game.note}</div>
    `;
    grid.appendChild(card);
  });
}

/* ── Social badges ── */
function renderSocials(socials) {
  const row = document.getElementById('social-row');
  if (!row || !socials) return;

  const platforms = [
    { key: 'twitch',  label: '🟣 Twitch',  cls: 'badge-twitch'  },
    { key: 'youtube', label: '🔴 YouTube', cls: 'badge-yt'       },
    { key: 'twitter', label: '🐦 Twitter', cls: 'badge-twitter'  },
    { key: 'bsky',    label: '🦋 BlueSky', cls: 'badge-bsky'     },
  ];

  row.innerHTML = '';
  platforms.forEach(p => {
    if (!socials[p.key]) return;
    const a       = document.createElement('a');
    a.href        = socials[p.key];
    a.target      = '_blank';
    a.rel         = 'noopener';
    a.className   = `social-badge ${p.cls}`;
    a.textContent = p.label;
    row.appendChild(a);
  });
}

/* ── Tagline, status bar counts, timezone label ── */
function renderMeta(data) {
  const tagEl = document.getElementById('hero-tagline');
  if (tagEl && data.tagline) tagEl.textContent = data.tagline;

  const updEl = document.getElementById('last-updated');
  if (updEl && data.lastUpdated) updEl.textContent = `📅 Actualizado: ${data.lastUpdated}`;

  const countEl = document.getElementById('stream-count');
  if (countEl && data.schedule) {
    const active = data.schedule.filter(s => s.active && s.tag !== 'Off').length;
    countEl.textContent = `${active} streams esta semana`;
  }

  const tzEl = document.getElementById('timezone-label');
  if (tzEl) tzEl.textContent = `🌍 Tu zona: ${getUserTimezone()}`;
}

/* ── Staggered row entrance animation ── */
function animateRows() {
  document.querySelectorAll('#schedule-body tr').forEach((row, i) => {
    row.style.opacity    = '0';
    row.style.transform  = 'translateX(-12px)';
    row.style.transition = `opacity .3s ${i * 55}ms, transform .3s ${i * 55}ms`;
    requestAnimationFrame(() => {
      row.style.opacity   = '';
      row.style.transform = '';
    });
  });
}


/* ════════════════════════════════════════════════════════════
   5. EMBED SETUP
   ════════════════════════════════════════════════════════════ */

function setupTwitchEmbed() {
  const iframe = document.getElementById('twitch-embed');
  if (!iframe) return;

  const channel = 'marchel_cc';
  let   parent  = window.location.hostname;
  if (parent === '' || parent === 'localhost' || parent === '127.0.0.1') parent = 'localhost';

  iframe.src = `https://player.twitch.tv/?channel=${channel}&parent=${parent}&autoplay=false&muted=false`;
}

function setupYoutubeEmbed(videoId) {
  const iframe = document.getElementById('youtube-embed');
  if (!iframe || !videoId) return;
  iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=0&modestbranding=1&rel=0`;
}

function setupYoutubeVODEmbed(vodId) {
  const iframe = document.getElementById('youtube-vod-embed');
  if (!iframe || !vodId) return;
  iframe.src = `https://www.youtube.com/embed/${vodId}?autoplay=0&modestbranding=1&rel=0`;
}


/* ════════════════════════════════════════════════════════════
   6. CLOCK
   ════════════════════════════════════════════════════════════ */

function startClock() {
  const el = document.getElementById('taskbar-clock');
  if (!el) return;
  const tick = () => {
    const n = new Date();
    el.textContent =
      String(n.getHours()).padStart(2, '0') + ':' +
      String(n.getMinutes()).padStart(2, '0');
  };
  tick();
  setInterval(tick, 30_000);
}


/* ════════════════════════════════════════════════════════════
   7. BOOT
   ════════════════════════════════════════════════════════════ */

async function init() {
  const data = await loadSchedule();

  if (!data) {
    const tbody = document.getElementById('schedule-body');
    if (tbody) tbody.innerHTML = `
      <tr><td colspan="4" style="text-align:center;padding:20px;color:#c00;">
        ⚠️ No se pudo cargar schedule.json
      </td></tr>`;
    return;
  }

  renderProfilePic(data.profilePic,  data.vtuber);
  renderMeta(data);
  renderSchedule(data.schedule       || []);
  renderRotation(data.rotationGames  || []);
  renderSocials(data.socials         || {});
  setupYoutubeEmbed(data.youtubeLatestVideoId);
  setupYoutubeVODEmbed(data.youtubeLatestVODId);

  setTimeout(animateRows, 150);
}

document.addEventListener('DOMContentLoaded', () => {
  WM.init();          // start window manager; opens hero window by default
  init();             // load and render schedule data
  startClock();       // taskbar clock
  setupTwitchEmbed(); // Twitch player
});
