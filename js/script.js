/* ============================================================
   MARCHEL WEBSITE — js/script.js
   Repo: marchel-cc/marchel-website (GitHub Pages)

   Sections:
     1. Window Manager (WM)  — floating, draggable XP Windows
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
    'discord':  { w: 500,  h: 600 },
    'github':   { w: 780,  h: 560 },
    'backlog':  { w: 960,  h: 600 },
  };

  /* ── Pinned placement — overrides cascade for specific windows.
     Each entry is a function (vw, vh, winW, winH) → { x, y }.
     Only used on first open when w.x === null. ── */
  const MARGIN = 16; // px gap from screen edges
  const ICON_COL = 84; // px width of desktop icon column on the left

  const PINNED = {
    /* Hero: left side, vertically centred, clear of the icon column */
    'hero': (vw, vh, ww, wh) => ({
      x: ICON_COL + MARGIN,
      y: Math.max(MARGIN, Math.round((vh - wh) / 2)),
    }),
    /* Discord: right side, same vertical centre as hero */
    'discord': (vw, vh, ww, wh) => ({
      x: Math.max(0, vw - ww - MARGIN),
      y: Math.max(MARGIN, Math.round((vh - wh) / 2)),
    }),
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
      const defs  = DEFAULTS[wid] || { w: 720, h: 550 };
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

    /* Any button with data-open — desktop icons AND taskbar icon buttons */
    document.querySelectorAll('button[data-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const wid = btn.dataset.open;
        open(wid);
        /* Sync focused style on taskbar-icon-btn immediately */
        syncTaskbarIconBtn(wid);
      });
    });

    /* Auto-open windows on load.
       Desktop: open all [data-autoopen] windows (hero, schedule, discord).
       Mobile:  open only hero and schedule so the page isn't overwhelming. */
    const autoOpenEls = document.querySelectorAll('.xp-window[data-wid][data-autoopen]');
    if (isMobile()) {
      ['hero', 'schedule'].forEach(wid => { if (wins[wid]) open(wid); });
    } else if (autoOpenEls.length > 0) {
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

    /* ── Mobile: toggle the window on/off in the page flow ── */
    if (isMobile()) {
      const isOpen = w.el.classList.contains('wm-mobile-open');
      if (isOpen) {
        /* Remove the open class first so its fill-mode stops holding the element.
           wm-mobile-closing keeps display:flex alive during the exit animation. */
        w.el.classList.remove('wm-mobile-open');
        w.el.classList.add('wm-mobile-closing');
        setTimeout(() => {
          w.el.classList.remove('wm-open', 'wm-mobile-closing');
          w.state = 'closed';
          syncIconState(wid);
        }, 200);
      } else {
        /* Open: reveal the window and scroll it into view */
        w.el.classList.add('wm-mobile-open', 'wm-open');
        w.state = 'open';
        setTimeout(() => {
          w.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 40);
        syncIconState(wid);
      }
      return;
    }

    /* ── Desktop: already open → just focus it ── */
    if (w.state === 'open') {
      focus(wid);
      return;
    }

    /* First-time placement */
    if (w.x === null && !isMobile()) {
      const vw = window.innerWidth;
      const vh = window.innerHeight - 36;  // subtract taskbar height
      w.w = Math.min(w.w, vw - 60);
      w.h = Math.min(w.h, vh - 40);

      if (PINNED[wid]) {
        /* Use the pinned layout function for this window */
        const pos = PINNED[wid](vw, vh, w.w, w.h);
        w.x = Math.max(0, Math.min(pos.x, vw - w.w - 8));
        w.y = Math.max(0, Math.min(pos.y, vh - w.h - 8));
      } else {
        /* Default: cascade from centre */
        const cx = Math.round((vw - w.w) / 2) + cascade * 28;
        const cy = Math.round((vh - w.h) / 2) + cascade * 28;
        w.x = Math.max(0, Math.min(cx, vw - w.w - 8));
        w.y = Math.max(0, Math.min(cy, vh - w.h - 8));
        cascade = (cascade + 1) % 9;
      }
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

    if (isMobile()) {
      w.el.classList.remove('wm-mobile-open');
      w.el.classList.add('wm-mobile-closing');
      setTimeout(() => {
        w.el.classList.remove('wm-open', 'wm-mobile-closing');
        w.state = 'closed';
        syncIconState(wid);
      }, 200);
      return;
    }

    /* Cancel any running open animation so the transition can take over */
    w.el.style.animation = 'none';
    w.el.getBoundingClientRect(); /* force reflow — lets the browser register the cleared animation */

    w.el.style.transition = 'opacity 0.15s ease-in, transform 0.15s ease-in';
    w.el.style.opacity    = '0';
    w.el.style.transform  = 'scale(0.88) translateY(6px)';

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
     MINIMIZE  — animate window shrinking toward its taskbar button
     ──────────────────────────────────────────────────────── */
  function minimize(wid) {
    const w = wins[wid];
    if (!w || w.state !== 'open') return;

    /* Grab the taskbar button rect NOW — it still exists while state is 'open' */
    const taskBtn = document.querySelector(`.win-task-btn[data-wid="${wid}"]`);
    const winRect  = w.el.getBoundingClientRect();

    /* Target: center of the taskbar button, or bottom-centre of screen */
    let targetX, targetY;
    if (taskBtn) {
      const r = taskBtn.getBoundingClientRect();
      targetX = r.left + r.width  / 2;
      targetY = r.top  + r.height / 2;
    } else {
      targetX = window.innerWidth  / 2;
      targetY = window.innerHeight - 18;
    }

    /* Translate from window centre to target */
    const winCX = winRect.left + winRect.width  / 2;
    const winCY = winRect.top  + winRect.height / 2;
    const dx = targetX - winCX;
    const dy = targetY - winCY;

    /* Scale: window shrinks to roughly the button's size */
    const scaleX = taskBtn
        ? Math.min(taskBtn.offsetWidth  / winRect.width,  0.15)
        : 0.08;
    const scaleY = taskBtn
        ? Math.min(taskBtn.offsetHeight / winRect.height, 0.10)
        : 0.04;

    /* Animate */
    w.el.style.animation       = 'none';  /* cancel wm-open fill so transition can fire */
    w.el.getBoundingClientRect();          /* force reflow */
    w.el.style.transformOrigin = 'center center';
    w.el.style.transition = 'opacity 0.22s ease-in, transform 0.22s cubic-bezier(0.4,0,1,1)';
    w.el.style.opacity    = '0';
    w.el.style.transform  = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;

    setTimeout(() => {
      /* Clear inline animation styles */
      w.el.style.transition      = '';
      w.el.style.opacity         = '';
      w.el.style.transform       = '';
      w.el.style.transformOrigin = '';
      w.el.classList.remove('wm-open', 'wm-focused');
      w.state = 'minimized';
      if (focused === wid) focused = null;
      updateTaskbar();
    }, 230);
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
    syncTaskbarIconBtn(wid);
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
      btn.className      = 'win-task-btn';
      btn.dataset.wid    = wid;   /* needed by minimize() to find this button */
      btn.title          = w.title;
      btn.innerHTML      =
          `<span>${w.icon}</span><span class="btn-label">${w.title}</span>`;

      if (w.state === 'minimized')                 btn.classList.add('wm-minimized');
      if (wid === focused && w.state === 'open')   btn.classList.add('wm-focused');

      btn.addEventListener('click', () => {
        if (w.state === 'minimized') {
          /* ── Restore: fly window UP from the taskbar button ── */

          /* Capture button rect BEFORE rebuilding the taskbar */
          const btnRect = btn.getBoundingClientRect();

          /* Make the window visible at its saved position */
          w.state = 'open';
          applyGeom(wid);
          w.el.classList.add('wm-open');

          /* Window rect now that it's positioned */
          const winRect = w.el.getBoundingClientRect();
          const winCX   = winRect.left + winRect.width  / 2;
          const winCY   = winRect.top  + winRect.height / 2;
          const btnCX   = btnRect.left + btnRect.width  / 2;
          const btnCY   = btnRect.top  + btnRect.height / 2;

          /* Start transform: window appears tiny at button position */
          const dx  = btnCX - winCX;
          const dy  = btnCY - winCY;
          const sx  = Math.max(btn.offsetWidth  / winRect.width,  0.05);
          const sy  = Math.max(btn.offsetHeight / winRect.height, 0.04);

          w.el.style.transformOrigin = 'center center';
          w.el.style.transition      = 'none';
          w.el.style.transform       = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
          w.el.style.opacity         = '0';

          /* Force reflow so browser registers the starting state */
          w.el.getBoundingClientRect();

          /* Animate to natural position */
          w.el.style.transition = 'opacity 0.2s ease-out, transform 0.2s cubic-bezier(0,0,0.2,1)';
          w.el.style.transform  = '';
          w.el.style.opacity    = '';

          /* Clean up transition properties once animation is done */
          setTimeout(() => {
            w.el.style.transition      = '';
            w.el.style.transformOrigin = '';
          }, 220);

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
    const w = wins[wid];
    const isOpen = isMobile()
        ? w?.el.classList.contains('wm-mobile-open')
        : w?.state !== 'closed';
    btn.classList.toggle('icon-active', !!isOpen);
  }

  /* Sync the wm-focused class on taskbar-icon-btn buttons
     so they visually indicate which window is active. */
  function syncTaskbarIconBtn(wid) {
    document.querySelectorAll('.taskbar-icon-btn[data-open]').forEach(btn => {
      const isThisOne = btn.dataset.open === wid;
      const winOpen   = wins[btn.dataset.open]?.state === 'open';
      btn.classList.toggle('wm-focused', isThisOne && winOpen);
    });
  }

  /* Public API */
  return { init, open, close, minimize, focus, _isMobile: isMobile };

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


/* Manual backlog data — status, plataforma, horas manuales (editado en el admin) */
async function loadBacklog() {
  try {
    const res = await fetch('data/backlog.json?nocache=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.games || [];
  } catch (err) {
    console.error('Error cargando backlog.json:', err);
    return [];
  }
}

/* Auto-generated Steam playtime — updated by GitHub Action */
async function loadBacklogSteam() {
  try {
    const res = await fetch('data/backlog-steam.json?nocache=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.warn('backlog-steam.json no disponible aún:', err.message);
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

  /* Group consecutive entries by day so we can rowspan the day cell.
     We walk the flat array and track when the day changes. */
  let i = 0;
  while (i < schedule.length) {
    const item     = schedule[i];
    const dayIndex = DAY_TO_INDEX[item.day] ?? -1;
    const isToday  = dayIndex === todayIndex;

    /* Count how many consecutive entries share this day */
    let slotCount = 1;
    while (
        i + slotCount < schedule.length &&
        schedule[i + slotCount].day === item.day
        ) slotCount++;

    /* Render each slot for this day */
    for (let s = 0; s < slotCount; s++) {
      const slot     = schedule[i + s];
      const tagClass = TAG_CLASS_MAP[slot.tag] || 'tag-stream-longo';
      const tr       = document.createElement('tr');

      if (!slot.active) tr.classList.add('inactive');
      if (isToday)      tr.classList.add('today');
      if (s > 0)        tr.classList.add('slot-extra'); /* not the first slot of the day */

      /* Convert Chile time to user's local time */
      let formattedTime = '—';
      if (slot.time != null) {
        const local = convertChileTimeToLocal(slot.time);
        formattedTime =
            String(local.getHours()).padStart(2, '0') + ':' +
            String(local.getMinutes()).padStart(2, '0');
      }

      /* Game logo */
      const hasLogo  = slot.imageUrl && slot.imageUrl.trim() && !slot.imageUrl.includes('your-');
      const gameCell = hasLogo
          ? `<div class="game-logo-wrap">
             <img class="game-logo" src="${slot.imageUrl}" alt="${slot.game}"
                  onerror="this.style.display='none'">
             <span>${slot.game}</span>
           </div>`
          : `<span>${slot.game}</span>`;

      /* Day cell: only on the FIRST slot, with rowspan to cover all slots */
      const dayCellHtml = s === 0
          ? `<td class="td-day" rowspan="${slotCount}">${slot.day}</td>`
          : ''; /* subsequent slots: day cell is covered by rowspan */

      tr.innerHTML = `
        ${dayCellHtml}
        <td class="td-time">${formattedTime}</td>
        <td class="td-game">${gameCell}</td>
        <td class="td-tag"><span class="tag ${tagClass}">${slot.tag}</span></td>
      `;
      tbody.appendChild(tr);
    }

    i += slotCount; /* jump past all slots we just rendered */
  }
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

/* ── Games Backlog ── */
const BACKLOG_STATUS_CONFIG = {
  'backlog':    { label: '📥 Backlog',    cls: 'status-backlog'    },
  'jugando':    { label: '🎮 Jugando',    cls: 'status-jugando'    },
  'pausado':    { label: '⏸️ Pausado',    cls: 'status-pausado'    },
  'dropeado':   { label: '🗑️ Dropeado',   cls: 'status-dropeado'   },
  'completado': { label: '✅ Completado', cls: 'status-completado' },
  'platino':    { label: '💯 100%',       cls: 'status-platino'    },
};

const BACKLOG_PLATFORM_CONFIG = {
  'steam': { label: '🟦 Steam', cls: 'platform-steam' },
  'gog':   { label: '🟪 GOG',   cls: 'platform-gog'   },
  'epic':  { label: '⬛ Epic',  cls: 'platform-epic'  },
  'retro': { label: '🕹️ Retro', cls: 'platform-retro' },
  'consola': { label: '🎮 Consola', cls: 'platform-consola' },
  'otro':  { label: '🎮 Otro',  cls: 'platform-otro'  },
};

function platformGroup(platform) {
  return ['steam', 'gog', 'epic'].includes(platform) ? 'pc' : 'otros';
}

const BACKLOG_ACHIEVEMENT_PREVIEW_COUNT = 6;

function minutesToHours(min) {
  if (!min && min !== 0) return null;
  return Math.round((min / 60) * 10) / 10; // 1 decimal
}

let BACKLOG_DATA = [];       // combination of backlog.json and backlog-steam.json, cached for the filters
let BACKLOG_VIEW = 'library'; // 'library' | 'list'

/* ── NUEVO: filtro de búsqueda por nombre ── */
let backlogSearchTerm = '';
let backlogSortMode = 'az';

function applyBacklogSort(list) {
  const sorted = [...list];

  sorted.sort((a, b) => {
    switch (backlogSortMode) {
      case 'za':
        return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
      case 'hours-desc': {
        const aHours = Number.isFinite(a.playedHours) ? a.playedHours : -1;
        const bHours = Number.isFinite(b.playedHours) ? b.playedHours : -1;
        if (bHours !== aHours) return bHours - aHours;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }
      case 'last-played-desc': {
        const aLast = Number.isFinite(a.lastPlayedUnix) ? a.lastPlayedUnix : -1;
        const bLast = Number.isFinite(b.lastPlayedUnix) ? b.lastPlayedUnix : -1;
        if (bLast !== aLast) return bLast - aLast;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }
      case 'az':
      default:
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }
  });

  return sorted;
}

function renderBacklog(manualGames, steamData) {
  const grid = document.getElementById('backlog-grid');
  if (!grid) return;

  /* Merge each manual entry with Steam or RetroAchievements hours/achievements */
  BACKLOG_DATA = manualGames.map(game => {
    const steamEntry = (game.appid && steamData?.games)
        ? steamData.games[game.appid]
        : null;
    const steamAch = (game.appid && steamData?.achievements)
        ? steamData.achievements[game.appid]
        : null;
    const raAch = (game.raGameId && steamData?.retroAchievements)
        ? steamData.retroAchievements[game.raGameId]
        : null;

    /* Time priority: Steam's automatic settings > admin's manual settings */
    const playedHours = steamEntry
        ? minutesToHours(steamEntry.playtimeForeverMinutes)
        : (game.hoursPlayed ?? null);
    const hoursAreManual = !steamEntry && game.hoursPlayed != null;

    const coverUrl = game.imageUrl && game.imageUrl.trim()
        ? game.imageUrl
        : (steamEntry?.libraryUrl || '');
    
    const capsuleUrl = game.capsuleUrl && game.capsuleUrl.trim()
        ? game.capsuleUrl
        : (steamEntry?.headerUrl || '');
    
    return {
      ...game,
      playedHours,
      coverUrl,
      capsuleUrl,
      steamLinked: !!steamEntry,
      hoursAreManual,
      lastPlayedUnix: steamEntry?.lastPlayedUnix ?? game.lastPlayedUnix ?? null,
      achievements: steamAch || raAch || null,
      achievementsSource: steamAch ? 'steam' : (raAch ? 'retro' : null)
    };
  });

  const updEl = document.getElementById('backlog-updated-status');
  if (updEl) {
    updEl.textContent = steamData?.updated
        ? `🔄 Datos actualizados: ${new Date(steamData.updated).toLocaleDateString()}`
        : '🔄 Sin conectar todavía';
  }

  updateBacklogSidebarCounts();
  drawBacklog();
}

let backlogStatusFilter   = 'all';
let backlogPlatformFilter = 'all';

function updateBacklogSidebarCounts() {
  const countFor = (status) => status === 'all'
      ? BACKLOG_DATA.length
      : BACKLOG_DATA.filter(g => g.status === status).length;

  document.querySelectorAll('[data-count-status]').forEach(el => {
    el.textContent = countFor(el.dataset.countStatus);
  });

  const platCountFor = (group) => group === 'all'
      ? BACKLOG_DATA.length
      : BACKLOG_DATA.filter(g => platformGroup(g.platform) === group).length;

  document.querySelectorAll('[data-count-platform]').forEach(el => {
    el.textContent = platCountFor(el.dataset.countPlatform);
  });
}

function drawBacklog() {
  const grid = document.getElementById('backlog-grid');
  if (!grid) return;

  const isNarrow = window.matchMedia('(max-width: 768px)').matches;
  const effectiveView = isNarrow ? 'list' : BACKLOG_VIEW;

  grid.classList.toggle('backlog-view-library', effectiveView === 'library');
  grid.classList.toggle('backlog-view-list', effectiveView === 'list');
  grid.innerHTML = '';

  /* Filtro combinado: estado + plataforma + búsqueda por nombre */
  const filtered = BACKLOG_DATA.filter(g => {
    const matchStatus = backlogStatusFilter === 'all' || g.status === backlogStatusFilter;
    const matchPlatform = backlogPlatformFilter === 'all' || platformGroup(g.platform) === backlogPlatformFilter;
    const matchSearch = backlogSearchTerm === '' || g.name.toLowerCase().includes(backlogSearchTerm.toLowerCase());
    return matchStatus && matchPlatform && matchSearch;
  });

  const list = applyBacklogSort(filtered);

  if (list.length === 0) {
    grid.innerHTML = `<div class="backlog-empty">🎣 Nada por aquí todavía...</div>`;
    updateBacklogCount(0);
    return;
  }

  list.forEach(game => {
    grid.appendChild(effectiveView === 'library' ? buildBacklogLibraryCard(game) : buildBacklogListRow(game));
  });

  updateBacklogCount(list.length);
}

function backlogCoverHtml(game, extraClass) {
  return game.coverUrl
      ? `<img class="${extraClass}" src="${game.coverUrl}" alt="${game.name}"
            onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${extraClass} backlog-cover-fallback',textContent:'🎮'}))">`
      : `<div class="${extraClass} backlog-cover-fallback">🎮</div>`;

}

function backlogHeaderHtml(game, extraClass) {
  return game.coverUrl
      ? `<img class="${extraClass}" src="${game.capsuleUrl}" alt="${game.name}"
            onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${extraClass} backlog-cover-fallback',textContent:'🎮'}))">`
      : `<div class="${extraClass} backlog-cover-fallback">🎮</div>`;
}


/* ── Library View: Vertical, Bookshelf-Style Covers ── */
function buildBacklogLibraryCard(game) {
  const cfg = BACKLOG_STATUS_CONFIG[game.status] || BACKLOG_STATUS_CONFIG['backlog'];
  const card = document.createElement('div');
  card.className = 'backlog-lib-card';
  card.innerHTML = `
    <div class="backlog-lib-cover-wrap">
      ${backlogCoverHtml(game, 'backlog-lib-cover')}
      <span class="backlog-status-tag ${cfg.cls} backlog-lib-status">${cfg.label}</span>
    </div>
    <div class="backlog-lib-name">${game.name}</div>
    <div class="backlog-lib-hours">${game.playedHours != null ? `⏱️ ${game.playedHours}h` : '—'}</div>
  `;
  return card;
}

/* ── List View: Steam Profile Style (hours, last played, achievements) ── */
function buildBacklogListRow(game) {
  const cfg      = BACKLOG_STATUS_CONFIG[game.status] || BACKLOG_STATUS_CONFIG['backlog'];
  const platCfg  = BACKLOG_PLATFORM_CONFIG[game.platform] || null;
  const row      = document.createElement('div');
  row.className  = 'backlog-list-row';

  const hoursText = game.playedHours != null
      ? `${game.playedHours}h en registro${game.hoursAreManual ? ' (manual)' : ''}`
      : 'Sin horas registradas';

  let achievementsHtml = '';
  if (game.achievements && game.achievements.total > 0) {
    const { unlocked, total, icons } = game.achievements;
    const pct = Math.round((unlocked / total) * 100);
    const shown = (icons || []).slice(0, BACKLOG_ACHIEVEMENT_PREVIEW_COUNT);
    const remaining = Math.max(0, total - shown.length);
    const sourceLabel = game.achievementsSource === 'retro' ? '🕹️ RetroAchievements' : '🏆 Logros';

    const iconsHtml = shown.map(a => `
      <img class="backlog-ach-icon ${a.achieved ? '' : 'backlog-ach-locked'}"
           src="${a.icon}" alt="${a.name || ''}" title="${a.name || ''}" loading="lazy">
    `).join('');

    achievementsHtml = `
      <div class="backlog-achievements">
        <div class="backlog-ach-header">
          <span>${sourceLabel}</span>
          <span class="backlog-ach-count">${unlocked} de ${total}</span>
        </div>
        <div class="backlog-ach-bar-track">
          <div class="backlog-ach-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="backlog-ach-icons-row">
          ${iconsHtml}
          ${remaining > 0 ? `<div class="backlog-ach-more">+${remaining}</div>` : ''}
        </div>
      </div>
    `;
  } else if (game.platform === 'steam' || game.raGameId) {
    achievementsHtml = `<div class="backlog-achievements backlog-ach-none">🏆 Sin datos de logros para este juego todavía</div>`;
  }

  row.innerHTML = `
    <div class="backlog-row-top">
      ${backlogHeaderHtml(game, 'backlog-row-cover')}
      <div class="backlog-row-info">
        <div class="backlog-row-name">${game.name}</div>
        <div class="backlog-row-tags">
          <span class="backlog-status-tag ${cfg.cls}">${cfg.label}</span>
          ${platCfg ? `<span class="backlog-platform-tag ${platCfg.cls}">${platCfg.label}</span>` : ''}
        </div>
        <div class="backlog-row-hours">${hoursText}</div>
      </div>
    </div>
    ${achievementsHtml}
  `;
  return row;
}

function updateBacklogCount(n) {
  const countEl = document.getElementById('backlog-count-status');
  if (countEl) countEl.textContent = `🐟 ${n} juego${n === 1 ? '' : 's'}`;
}

const BACKLOG_STATUS_CRUMBS = {
  'all': '🗂️ Todos los juegos', 'jugando': '🎮 Jugando', 'completado': '✅ Completados',
  'backlog': '📥 Backlog', 'pausado': '⏸️ Pausados', 'dropeado': '🗑️ Dropeados', 'platino': '💯 100%',
};
const BACKLOG_PLATFORM_CRUMBS = { 'pc': '🖥️ PC', 'otros': '🎮 Otros' };

function updateBacklogCrumb() {
  const crumbEl = document.getElementById('backlog-crumb');
  if (!crumbEl) return;
  const parts = [BACKLOG_STATUS_CRUMBS[backlogStatusFilter] || 'Todos'];
  if (backlogPlatformFilter !== 'all') parts.push(BACKLOG_PLATFORM_CRUMBS[backlogPlatformFilter]);
  if (backlogSearchTerm) parts.push(`🔍 "${backlogSearchTerm}"`);
  crumbEl.textContent = parts.join(' · ');
}

function setupBacklogFilters() {
  const sidebar = document.getElementById('backlog-sidebar');
  if (sidebar) {
    sidebar.querySelectorAll('.backlog-sidebar-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.filterType;
        sidebar.querySelectorAll(`.backlog-sidebar-item[data-filter-type="${type}"]`)
            .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (type === 'status') backlogStatusFilter = btn.dataset.filter;
        else backlogPlatformFilter = btn.dataset.filter;

        updateBacklogCrumb();
        drawBacklog();
      });
    });
  }

  const toggle = document.getElementById('backlog-view-toggle');
  if (toggle) {
    toggle.querySelectorAll('.backlog-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        toggle.querySelectorAll('.backlog-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        BACKLOG_VIEW = btn.dataset.view; 
        drawBacklog();
      });
    });
  }

  /* ── Conectar el input de búsqueda ── */
  const searchInput = document.querySelector('.backlog-search input[type="search"]');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      backlogSearchTerm = searchInput.value.trim();
      updateBacklogCrumb();
      drawBacklog();
    });
  }

  const sortSelect = document.getElementById('backlog-sort-select');
  if (sortSelect) {
    sortSelect.value = backlogSortMode;
    sortSelect.addEventListener('change', () => {
      backlogSortMode = sortSelect.value;
      drawBacklog();
    });
  }
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
  if (tzEl) tzEl.textContent = `🌍 ${getUserTimezone()}`;
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
   6.5 GITHUB REPOS WINDOW
   ════════════════════════════════════════════════════════════ */

/* Language → hex colour (subset of GitHub's palette) */
const LANG_COLOURS = {
  'JavaScript':  '#f1e05a',
  'TypeScript':  '#3178c6',
  'Python':      '#3572A5',
  'HTML':        '#e34c26',
  'CSS':         '#563d7c',
  'Vue':         '#41b883',
  'Svelte':      '#ff3e00',
  'Rust':        '#dea584',
  'Go':          '#00ADD8',
  'Java':        '#b07219',
  'C#':          '#178600',
  'C++':         '#f34b7d',
  'C':           '#555555',
  'Shell':       '#89e051',
  'Ruby':        '#701516',
  'PHP':         '#4F5D95',
  'Kotlin':      '#A97BFF',
  'Swift':       '#F05138',
  'Dart':        '#00B4AB',
  'Lua':         '#000080',
};

async function fetchAndRenderGithubRepos() {
  const container = document.getElementById('repos-grid');
  if (!container) return;

  const GITHUB_USER = 'marchelcc';

  container.innerHTML = '<div class="repos-loading">🐙 Cargando repositorios...</div>';

  try {
    const res = await fetch(
        `https://api.github.com/users/${GITHUB_USER}/repos?sort=updated&per_page=12&type=owner`,
        { headers: { 'Accept': 'application/vnd.github+json' } }
    );

    if (!res.ok) throw new Error(`GitHub API: ${res.status}`);

    const repos = await res.json();

    /* Filter out forks (optional — remove the filter to show all) */
    const ownRepos = repos.filter(r => !r.fork);

    if (ownRepos.length === 0) {
      container.innerHTML = '<div class="repos-loading">No se encontraron repositorios públicos.</div>';
      return;
    }

    container.innerHTML = '';

    ownRepos.forEach(repo => {
      const langColour = LANG_COLOURS[repo.language] || '#999';
      const desc = repo.description
          ? repo.description
          : null;

      /* Topics (up to 3) */
      const topicTags = (repo.topics || []).slice(0, 3)
          .map(t => `<span class="repo-topic">${t}</span>`)
          .join('');

      /* Build card */
      const card = document.createElement('a');
      card.className  = 'repo-card';
      card.href       = repo.html_url;
      card.target     = '_blank';
      card.rel        = 'noopener';
      card.title      = repo.full_name;

      card.innerHTML = `
        <div class="repo-card-name">
          <span class="repo-icon">📁</span>
          ${repo.name}
        </div>
        <div class="repo-card-desc${desc ? '' : ' empty'}">
          ${desc ? desc : 'Sin descripción'}
        </div>
        <div class="repo-card-meta">
          ${repo.language ? `
            <span class="repo-lang">
              <span class="repo-lang-dot" style="background:${langColour}"></span>
              ${repo.language}
            </span>` : ''}
          ${repo.stargazers_count > 0 ? `
            <span class="repo-stat">⭐ ${repo.stargazers_count}</span>` : ''}
          ${repo.forks_count > 0 ? `
            <span class="repo-stat">🍴 ${repo.forks_count}</span>` : ''}
          ${topicTags}
        </div>
      `;

      container.appendChild(card);
    });

  } catch (err) {
    console.error('GitHub repos error:', err);
    container.innerHTML = `<div class="repos-error">⚠️ No se pudieron cargar los repos.<br><small>${err.message}</small></div>`;
  }
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

  /* Backlog: independent of schedule.json — does not block if it fails */
  const [manualGames, steamData] = await Promise.all([loadBacklog(), loadBacklogSteam()]);
  renderBacklog(manualGames, steamData);
  setupBacklogFilters();
}

document.addEventListener('DOMContentLoaded', () => {
  WM.init();          // start window manager; opens hero window by default
  init();             // load and render schedule data
  startClock();       // taskbar clock
  setupTwitchEmbed(); // Twitch player

  /* On resize from mobile → desktop, clean up mobile-open classes so the
     desktop WM takes over cleanly. Vice-versa: collapse all windows. */
  let lastMobile = WM._isMobile();
  window.addEventListener('resize', () => {
    const nowMobile = WM._isMobile();
    if (nowMobile === lastMobile) return;
    lastMobile = nowMobile;

    document.querySelectorAll('.xp-window[data-wid]').forEach(el => {
      if (nowMobile) {
        /* Switched to mobile — desktop WM classes no longer apply */
        el.classList.remove('wm-open', 'wm-focused', 'wm-maximized');
        el.style.cssText = '';
      } else {
        /* Switched to desktop — remove mobile class */
        el.classList.remove('wm-mobile-open');
      }
    });

    /* The backlog changes view (forced list on mobile) when crossing the breakpoint */
    if (typeof drawBacklog === 'function' && BACKLOG_DATA.length > 0) drawBacklog();
  }, { passive: true });

  /* Lazy-load GitHub repos the first time the github window is opened */
  let reposFetched = false;
  const githubDesktopBtn = document.querySelector('button[data-open="github"]');
  const githubTaskbarBtn = document.querySelector('.taskbar-icon-btn[data-open="github"]');
  const triggerRepoFetch = () => {
    if (!reposFetched) {
      reposFetched = true;
      fetchAndRenderGithubRepos();
    }
  };
  githubDesktopBtn?.addEventListener('click', triggerRepoFetch);
  githubTaskbarBtn?.addEventListener('click', triggerRepoFetch);
});