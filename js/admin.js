'use strict';

/* ═══════════════════════════════════════════════════════════
   CONFIG — revisa que owner/repo sean los de tu repo real
   ═══════════════════════════════════════════════════════════ */
const CONFIG = {
  owner: 'marchelcc',
  repo: 'marchelcc.github.io',
  branch: null,                       // null = rama por defecto del repo
  schedulePath: 'data/schedule.json',
  socialsPath: 'data/socials.json',
  backlogPath: 'data/backlog.json',
};
const STORE_KEY = 'marchel_admin_token';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const TAGS = ['Stream Longo', 'Stream Shorti', 'Colab', 'Nuevo Video'];   // “Off” se genera solo en días sin horarios
const STATUS = [
  { value: 'backlog', label: '📥 Backlog' },
  { value: 'jugando', label: '🎮 Jugando' },
  { value: 'pausado', label: '⏸️ Pausado' },
  { value: 'dropeado', label: '🗑️ Dropeado' },
  { value: 'completado', label: '✅ Completado' },
  { value: 'platino', label: '💯 100%' },
];
const MC_IMG = 'https://i.imgur.com/GXqX6kG.png';
const PLATFORMS = [
  { value: 'steam', label: 'Steam', icon: 'steam', color: '171A21' },
  { value: 'gog', label: 'GOG', icon: 'gogdotcom', color: '86328A' },
  { value: 'epic', label: 'Epic Games', icon: 'epicgames', color: '313131' },
  { value: 'retro', label: 'Retro / Emulado', emoji: '🕹️' },
  { value: 'consola', label: 'Consola', emoji: '🎮' },
  { value: 'otro', label: 'Otro', emoji: '🎮' },
  { value: 'Mapa de MC', label: 'Mapa MC', img: MC_IMG },
  { value: 'Evento de MC', label: 'Evento MC', img: MC_IMG },
];
const LEGACY_PLATFORMS = { 'minecraft-map': 'Mapa de MC', 'minecraft-event': 'Evento de MC' };
function platIcon(v) {
  const c = PLATFORMS.find(p => p.value === v) || { emoji: '🎮' };
  if (c.icon) return `<img src="https://cdn.simpleicons.org/${c.icon}/${c.color}" alt="">`;
  if (c.img) return `<img src="${c.img}" alt="">`;
  return `<span>${c.emoji}</span>`;
}
const MC_PLATFORMS = ['Mapa de MC', 'Evento de MC'];
const isMC = g => MC_PLATFORMS.includes(g.platform);
const TAG_CLS = { 'Stream Longo': 'tag-stream-longo', 'Stream Shorti': 'tag-stream-shorti', 'Colab': 'tag-colab', 'Nuevo Video': 'tag-video', 'Off': 'tag-off' };

/* ═══════════ helpers ═══════════ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opts = (list, cur) => {
  const items = list.some(o => o.value === cur) || cur == null ? list : [...list, { value: cur, label: String(cur) }];
  return items.map(o => `<option value="${esc(o.value)}" ${o.value === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
};
const todayChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const todayName = () => {
  const n = new Date().toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'America/Santiago' });
  return n.charAt(0).toUpperCase() + n.slice(1);
};
const ytId = v => {
  v = (v || '').trim();
  const m = v.match(/(?:v=|youtu\.be\/|embed\/|live\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : v;
};
let toastTimer;
function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', isErr);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), isErr ? 6000 : 2800);
}

/* ═══════════ GitHub API ═══════════ */
let token = null;

async function gh(path, opt = {}) {
  const res = await fetch('https://api.github.com' + path, {
    cache: 'no-store',
    ...opt,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opt.headers || {}),
    },
  });
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
const contentsUrl = p => `/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${p}`;
const decodeB64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), c => c.charCodeAt(0)));
const encodeB64 = str => { let bin = ''; new TextEncoder().encode(str).forEach(b => (bin += String.fromCharCode(b))); return btoa(bin); };

async function readFile(path, optional = false) {
  try {
    const q = CONFIG.branch ? `?ref=${encodeURIComponent(CONFIG.branch)}` : '';
    const f = await gh(contentsUrl(path) + q);
    return { json: JSON.parse(decodeB64(f.content)), sha: f.sha };
  } catch (e) {
    if (optional && e.status === 404) return { json: null, sha: null };
    if (e.status === 404) e.message = `No encontré ${path} en ${CONFIG.owner}/${CONFIG.repo}. Revisa CONFIG al inicio de admin.js y que el token tenga acceso a ese repo.`;
    throw e;
  }
}

async function writeFile(path, obj, file, message) {
  const body = { message, content: encodeB64(JSON.stringify(obj, null, 2) + '\n') };
  if (file.sha) body.sha = file.sha;
  if (CONFIG.branch) body.branch = CONFIG.branch;
  const r = await gh(contentsUrl(path), { method: 'PUT', body: JSON.stringify(body) });
  file.sha = r.content.sha;
}

/* ═══════════ State ═══════════ */
const files = {
  schedule: { sha: null, base: '', date: '' },
  socials: { sha: null, base: '' },
  backlog: { sha: null, base: '' },
};
let doc = {};            // schedule.json sin el array "schedule"
let days = {};           // { Lunes: [slot, …], … }
let socials = {};
let games = [];
const openGames = new Set();
const filters = { backlog: { q: '', status: 'all' }, mc: { q: '', status: 'all' } };

function parseSchedule(json) {
  const { schedule = [], ...rest } = json;
  doc = { vtuber: '', tagline: '', profilePic: '', youtubeLatestVideoId: '', youtubeLatestVODId: '', ...rest };
  delete doc.socials;
  doc.rotationGames ??= [];
  days = Object.fromEntries(DAYS.map(d => [d, []]));
  schedule.forEach(it => {
    if (!days[it.day]) return;
    if (it.tag === 'Off' && (!it.game || it.game === '-')) return;   // día libre
    days[it.day].push({
      time: it.time && it.time !== '-' ? String(it.time) : '',
      game: it.game || '',
      imageUrl: it.imageUrl || '',
      tag: it.tag || 'Stream Longo',
    });
  });
}

function parseSocials(json) {
  socials = { ...json };
}

function buildSchedule(date) {
  let id = 1;
  const schedule = [];
  DAYS.forEach(day => {
    const slots = days[day];
    if (!slots.length) {
      schedule.push({ id: id++, day, time: null, game: '-', imageUrl: '', tag: 'Off', active: false });
    } else {
      slots.forEach(s => schedule.push({
        id: id++, day, time: s.time.trim() || null, game: s.game.trim(),
        imageUrl: s.imageUrl.trim(), tag: s.tag, active: true,
      }));
    }
  });
  const { rotationGames, ...head } = doc;
  return { ...head, lastUpdated: date, schedule, rotationGames };
}
const buildBacklog = () => ({ games });

function dirty() {
  return {
    schedule: JSON.stringify(buildSchedule(files.schedule.date)) !== files.schedule.base,
    socials: JSON.stringify(socials) !== files.socials.base,
    backlog: JSON.stringify(buildBacklog()) !== files.backlog.base,
  };
}
function markClean() {
  files.schedule.base = JSON.stringify(buildSchedule(files.schedule.date));
  files.socials.base = JSON.stringify(socials);
  files.backlog.base = JSON.stringify(buildBacklog());
}
function refreshStatus() {
  const d = dirty();
  const names = [d.schedule && 'Horario / Perfil', d.socials && 'Redes', d.backlog && 'Backlog'].filter(Boolean);
  const st = $('#status');
  st.textContent = names.length ? `● Sin guardar: ${names.join(' y ')}` : '✓ Todo guardado';
  st.classList.toggle('dirty', names.length > 0);
  $('#save-btn').disabled = !names.length;
  renderPreview();
}

/* ═══════════ Render: schedule ═══════════ */
function slotHtml(day, i, s) {
  const k = `data-scope="slot" data-day="${day}" data-i="${i}"`;
  return `
  <div class="slot">
    <input class="in-time" type="text" ${k} data-f="time" value="${esc(s.time)}" placeholder="19:00" aria-label="Hora (Chile)">
    <input class="in-game" type="text" ${k} data-f="game" value="${esc(s.game)}" placeholder="¿Qué vas a jugar?" aria-label="Juego o contenido">
    <select class="in-tag" ${k} data-f="tag" aria-label="Tipo">${opts(TAGS.map(t => ({ value: t, label: t })), s.tag)}</select>
    <button class="icon-btn" data-act="del-slot" data-day="${day}" data-i="${i}" title="Quitar este horario">🗑️</button>
    <div class="url-field">
      <img class="thumb" src="${esc(s.imageUrl)}" ${s.imageUrl ? '' : 'hidden'} alt="" onerror="this.hidden=true">
      <input type="url" ${k} data-f="imageUrl" value="${esc(s.imageUrl)}" placeholder="Logo del juego (URL de imgur, opcional)" aria-label="Logo">
    </div>
  </div>`;
}

function renderSchedule() {
  const today = todayName();
  $('#schedule-root').innerHTML = DAYS.map(day => {
    const slots = days[day];
    return `
    <article class="day ${day === today ? 'today' : ''}">
      <header class="day-h">
        <span>${day}</span>${day === today ? '<span class="badge">Hoy</span>' : ''}
        <span class="count">${slots.length ? slots.length + (slots.length > 1 ? ' horarios' : ' horario') : 'Libre'}</span>
      </header>
      <div class="day-b">
        ${slots.map((s, i) => slotHtml(day, i, s)).join('') || '<p class="empty">Sin stream este día</p>'}
        <button class="btn small" data-act="add-slot" data-day="${day}">+ Agregar horario</button>
      </div>
    </article>`;
  }).join('');
}

/* ═══════════ Render: schedule preview ═══════════ */
function renderPreview() {
  const root = $('#preview-root');
  if (!root) return;
  const today = todayName();
  let rows = '';
  DAYS.forEach(day => {
    const slots = days[day].length ? days[day] : [{ free: true, time: '', game: '-', imageUrl: '', tag: 'Off' }];
    slots.forEach((s, i) => {
      const logo = s.imageUrl ? `<img class="game-logo" src="${esc(s.imageUrl)}" alt="" onerror="this.style.display='none'">` : '';
      rows += `<tr class="${s.free ? 'inactive' : ''} ${day === today ? 'today' : ''}">
        ${i === 0 ? `<td class="td-day" rowspan="${slots.length}">${day}</td>` : ''}
        <td class="td-time">${esc(s.time.trim() || '—')}</td>
        <td class="td-game"><div class="game-logo-wrap">${logo}<span>${esc(s.game || '(sin nombre)')}</span></div></td>
        <td class="td-tag"><span class="tag ${TAG_CLS[s.tag] || 'tag-stream-longo'}">${esc(s.tag)}</span></td></tr>`;
    });
  });
  root.innerHTML = `<table class="schedule-table"><thead><tr><th>Día</th><th>Hora</th><th>Juego / Contenido</th><th>Tipo</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ═══════════ Render: backlog ═══════════ */
function gameHtml(g, kind) {
  const k = `data-scope="game" data-id="${g.id}"`;
  const open = openGames.has(g.id);
  const auto = g.platform === 'steam' && g.appid;
  return `
  <div class="game ${open ? 'open' : ''}">
    <div class="game-row">
      ${g.imageUrl ? `<img class="cover" src="${esc(g.imageUrl)}" alt="" onerror="this.outerHTML='<span class=&quot;cover ph&quot;>🎮</span>'">` : '<span class="cover ph">🎮</span>'}
      <input class="in-name" type="text" ${k} data-f="name" value="${esc(g.name)}" placeholder="Nombre del juego" aria-label="Nombre">
      <select class="in-status" ${k} data-f="status" aria-label="Estado">${opts(STATUS, g.status)}</select>
      <div class="plat"><span class="plat-ico" title="Plataforma">${platIcon(g.platform)}</span>
        <select class="in-plat" ${k} data-f="platform" aria-label="Plataforma">${opts(kind === 'mc' ? PLATFORMS.filter(p => MC_PLATFORMS.includes(p.value)) : PLATFORMS, g.platform)}</select></div>
      <label class="hours">⏱️ <input type="number" min="0" step="0.5" ${k} data-f="hoursPlayed" data-num value="${g.hoursPlayed ?? ''}" ${auto ? 'disabled placeholder="auto"' : 'placeholder="0"'} aria-label="Horas jugadas"> h</label>
      <button class="icon-btn" data-act="toggle-game" data-id="${g.id}" title="${open ? 'Cerrar' : 'Más opciones'}">${open ? '▴' : '▾'}</button>
    </div>
    ${open ? `
    <div class="game-more">
      <div class="field"><label>Steam App ID</label>
        <input type="number" ${k} data-f="appid" data-num data-rerender value="${g.appid ?? ''}" placeholder="632360" ${g.platform === 'steam' ? '' : 'disabled'}>
        <div class="note">El número en store.steampowered.com/app/<b>632360</b>/… Solo para Steam.</div></div>
      <div class="field"><label>RetroAchievements Game ID</label>
        <input type="number" ${k} data-f="raGameId" data-num value="${g.raGameId ?? ''}" placeholder="opcional">
        <div class="note">El número en la URL del juego en retroachievements.org.</div></div>
      <div class="field wide"><label>Portada vertical (URL)</label>
        <input type="url" ${k} data-f="imageUrl" value="${esc(g.imageUrl)}" placeholder="https://… (vista biblioteca)"></div>
      <div class="field wide"><label>Capsule horizontal (URL)</label>
        <input type="url" ${k} data-f="capsuleUrl" value="${esc(g.capsuleUrl)}" placeholder="https://… (vista lista)"></div>
      <div class="end"><button class="btn danger small" data-act="del-game" data-id="${g.id}">🗑️ Eliminar juego</button></div>
    </div>` : ''}
  </div>`;
}

function renderBacklog() {
  ['backlog', 'mc'].forEach(kind => {
    const { q, status } = filters[kind];
    const pool = games.filter(g => isMC(g) === (kind === 'mc'));
    const list = pool.filter(g => (status === 'all' || g.status === status) && (!q || (g.name || '').toLowerCase().includes(q.toLowerCase())));
    $(`#count-${kind}`).textContent = `${list.length} de ${pool.length}`;
    $(`#subcount-${kind}`).textContent = pool.length;
    $(`#list-${kind}`).innerHTML = list.map(g => gameHtml(g, kind)).join('') ||
      `<p class="empty">${pool.length ? 'Ningún juego coincide 🎣' : 'Aún no hay nada aquí.'}</p>`;
  });
}

/* ═══════════ Render: profile ═══════════ */
function renderProfile() {
  const f = (label, scope, key, val, ph = '', type = 'text', extra = '') =>
    `<div class="field"><label>${label}</label><input type="${type}" data-scope="${scope}" data-f="${key}" ${extra} value="${esc(val)}" placeholder="${esc(ph)}"></div>`;
  const s = socials;
  $('#profile-root').innerHTML = `
    <fieldset class="dc-group">
      <legend>Foto de perfil</legend>
      <div class="profile-top">
        <img class="avatar" id="avatar" src="${esc(doc.profilePic)}" ${doc.profilePic ? '' : 'hidden'} alt="" onerror="this.hidden=true">
        <div class="field">
          <label>URL de imgur (imagen cuadrada)</label>
          <input type="url" data-scope="meta" data-f="profilePic" value="${esc(doc.profilePic)}" placeholder="https://i.imgur.com/…">
        </div>
      </div>
      <div class="profile-top" style="margin-top:12px">
        <div class="field">
          <label>Mensaje junto a la foto (burbuja)</label>
          <input type="text" maxlength="60" data-scope="meta" data-f="tagline" data-bubble value="${esc(doc.tagline)}" placeholder="🎣 pescando contenido...">
          <div class="note">Texto corto: aparece en la burbuja amarilla al lado de tu foto en la web.</div>
        </div>
        <div class="bubble-prev" id="bubble-prev">${esc(doc.tagline) || '<span class="muted">(vacío)</span>'}</div>
      </div>
    </fieldset>
    <fieldset class="dc-group">
      <legend>Canal</legend>
      <div class="profile-grid">
        ${f('Nombre', 'meta', 'vtuber', doc.vtuber)}
      </div>
    </fieldset>
    <fieldset class="dc-group">
      <legend>YouTube</legend>
      <div class="profile-grid">
        ${f('Último video', 'meta', 'youtubeLatestVideoId', doc.youtubeLatestVideoId, 'Pega el link o el ID', 'text', 'data-yt')}
        ${f('Último VOD', 'meta', 'youtubeLatestVODId', doc.youtubeLatestVODId, 'Pega el link o el ID', 'text', 'data-yt')}
      </div>
    </fieldset>
    <fieldset class="dc-group">
      <legend>Redes</legend>
      <div class="profile-grid">
        ${f('Twitch', 'social', 'twitch', s.twitch, 'https://www.twitch.tv/…', 'url')}
        ${f('YouTube', 'social', 'youtube', s.youtube, 'https://www.youtube.com/@…', 'url')}
        ${f('YouTube VODs', 'social', 'youtubevods', s.youtubevods, 'https://www.youtube.com/@…', 'url')}
        ${f('Twitter / X', 'social', 'twitter', s.twitter, 'https://x.com/…', 'url')}
        ${f('Bluesky', 'social', 'bsky', s.bsky, 'https://bsky.app/profile/…', 'url')}
        ${f('Instagram', 'social', 'instagram', s.instagram, 'https://www.instagram.com/…', 'url')}
        ${f('Correo de contacto', 'social', 'email', s.email, 'nombre@ejemplo.com', 'email')}
      </div>
    </fieldset>
    <fieldset class="dc-group">
      <legend>Respaldo manual</legend>
      <div class="adv">
        <button class="btn small" data-act="download" data-what="schedule">⬇ schedule.json</button>
        <button class="btn small" data-act="download" data-what="socials">⬇ socials.json</button>
        <button class="btn small" data-act="download" data-what="backlog">⬇ backlog.json</button>
      </div>
    </fieldset>`;
}

/* ═══════════ Editing (event delegation) ═══════════ */
function applyEdit(t) {
  const { scope, f } = t.dataset;
  const val = t.type === 'checkbox' ? t.checked : t.dataset.num !== undefined ? (t.value === '' ? null : Number(t.value)) : t.value;
  if (scope === 'slot') days[t.dataset.day][+t.dataset.i][f] = val;
  else if (scope === 'game') { const g = games.find(x => x.id == t.dataset.id); if (g) g[f] = val; }
  else if (scope === 'meta') doc[f] = val;
  else if (scope === 'social') socials[f] = val;
}

document.addEventListener('input', e => {
  const t = e.target;
  if (t.classList.contains('f-search')) { filters[t.dataset.kind].q = t.value.trim(); renderBacklog(); return; }
  if (!t.dataset.scope) return;
  applyEdit(t);
  if (t.dataset.bubble !== undefined) $('#bubble-prev').textContent = t.value || '(vacío)';
  refreshStatus();
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.classList.contains('f-status')) { filters[t.dataset.kind].status = t.value; renderBacklog(); return; }
  if (!t.dataset.scope) return;
  if (t.dataset.scope === 'game' && t.dataset.f === 'platform') {
    const g = games.find(x => x.id == t.dataset.id);
    const here = t.closest('.subpanel').id === 'sub-mc' ? 'mc' : 'backlog';
    const there = g && isMC(g) ? 'mc' : 'backlog';
    if (g && here !== there) toast(`➡️ “${g.name}” pasó a la pestaña ${there === 'mc' ? 'Minecraft' : 'Backlog'}`);
  }
  if (t.dataset.yt !== undefined) { t.value = ytId(t.value); applyEdit(t); refreshStatus(); }
  if (t.dataset.f === 'imageUrl' && t.closest('.url-field')) {
    const img = $('.thumb', t.closest('.url-field'));
    img.hidden = !t.value; img.src = t.value;
  }
  if (t.dataset.f === 'profilePic') {
    const img = $('#avatar'); img.hidden = !t.value; img.src = t.value;
  }
  if (t.dataset.scope === 'game' && ['imageUrl', 'platform', 'appid', 'status'].includes(t.dataset.f)) renderBacklog();
});


const actions = {
  tab(el) {
    $$('.tab').forEach(b => b.classList.toggle('active', b === el));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + el.dataset.tab));
  },
  subtab(el) {
    $$('.subtab').forEach(b => b.classList.toggle('active', b === el));
    $$('.subpanel').forEach(p => p.classList.toggle('active', p.id === 'sub-' + el.dataset.sub));
  },
  'add-slot'(el) {
    days[el.dataset.day].push({ time: '19:00', game: '', imageUrl: '', tag: 'Stream Longo' });
    renderSchedule(); refreshStatus();
  },
  'del-slot'(el) {
    days[el.dataset.day].splice(+el.dataset.i, 1);
    renderSchedule(); refreshStatus();
  },
  'add-game'(el) {
    const kind = el.dataset.kind;
    const id = Math.max(100, ...games.map(g => +g.id || 0)) + 1;
    games.push({
      id, name: kind === 'mc' ? 'Nuevo mapa / evento' : 'Nuevo juego', appid: null, raGameId: null,
      platform: kind === 'mc' ? 'Mapa de MC' : 'otro', status: 'backlog', hoursPlayed: null, imageUrl: '', capsuleUrl: '',
    });
    filters[kind] = { q: '', status: 'all' };
    $(`.f-search[data-kind="${kind}"]`).value = ''; $(`.f-status[data-kind="${kind}"]`).value = 'all';
    openGames.add(id);
    renderBacklog(); refreshStatus();
    const last = $$(`#list-${kind} .game`).pop();
    last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('.in-name', last)?.select();
  },
  'del-game'(el) {
    const g = games.find(x => x.id == el.dataset.id);
    if (!g || !confirm(`¿Eliminar “${g.name}” del backlog?`)) return;
    games = games.filter(x => x !== g);
    renderBacklog(); refreshStatus();
  },
  'toggle-game'(el) {
    const id = +el.dataset.id;
    openGames.has(id) ? openGames.delete(id) : openGames.add(id);
    renderBacklog();
  },
  download(el) {
    const what = el.dataset.what;
    const obj = what === 'schedule' ? buildSchedule(todayChile()) : what === 'socials' ? socials : buildBacklog();
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2) + '\n'], { type: 'application/json' })),
      download: `${what}.json`,
    });
    a.click(); URL.revokeObjectURL(a.href);
  },
  close() { location.href = 'index.html'; },
  logout() {
    localStorage.removeItem(STORE_KEY); sessionStorage.removeItem(STORE_KEY);
    location.reload();
  },
  save,
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) actions[el.dataset.act](el);
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && !$('#app').hidden) { e.preventDefault(); if (!$('#save-btn').disabled) save(); }
});
window.addEventListener('beforeunload', e => {
  if ($('#app').hidden) return;
  const d = dirty();
  if (d.schedule || d.socials || d.backlog) { e.preventDefault(); e.returnValue = ''; }
});

/* ═══════════ Save ═══════════ */
async function save() {
  const emailField = $('#profile-root input[type="email"]');
  if (emailField && !emailField.reportValidity()) return;
  const d = dirty();
  const btn = $('#save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    if (d.schedule) {
      const date = todayChile();
      await writeFile(CONFIG.schedulePath, buildSchedule(date), files.schedule, 'Admin: actualizar horario / perfil');
      doc.lastUpdated = date; files.schedule.date = date;
    }
    if (d.socials) await writeFile(CONFIG.socialsPath, socials, files.socials, 'Admin: actualizar redes');
    if (d.backlog) await writeFile(CONFIG.backlogPath, buildBacklog(), files.backlog, 'Admin: actualizar backlog');
    markClean();
    toast('✅ Guardado en GitHub — la web se actualiza en ~1 minuto');
  } catch (err) {
    const msg = err.status === 409 || err.status === 422
      ? 'El archivo cambió en GitHub mientras editabas. Copia lo que necesites, recarga la página y vuelve a intentar.'
      : err.status === 403 || err.status === 404
        ? 'GitHub rechazó el guardado. ¿El token tiene permiso “Contents: Read and write” en este repo?'
        : 'No se pudo guardar: ' + err.message;
    toast(msg, true);
  } finally {
    btn.textContent = 'Guardar cambios';
    refreshStatus();
  }
}

/* ═══════════ Boot / login ═══════════ */
async function startApp(tok, remember) {
  token = tok;
  const user = await gh('/user');
  if (user.login.toLowerCase() !== CONFIG.owner.toLowerCase()) throw new Error(`La cuenta “${user.login}” no tiene acceso. Solo ${CONFIG.owner}.`);

  const [s, soc, b] = await Promise.all([
    readFile(CONFIG.schedulePath),
    readFile(CONFIG.socialsPath),
    readFile(CONFIG.backlogPath, true),
  ]);
  parseSchedule(s.json);
  parseSocials(soc.json);
  files.schedule.sha = s.sha; files.schedule.date = doc.lastUpdated || todayChile();
  files.socials.sha = soc.sha;
  games = (b.json?.games || []).map(g => ({ ...g, platform: LEGACY_PLATFORMS[g.platform] || g.platform }));
  files.backlog.sha = b.sha;
  markClean();

  (remember ? localStorage : sessionStorage).setItem(STORE_KEY, tok);
  $('#user-name').textContent = user.login;
  $$('.f-status').forEach(el => {
    el.innerHTML = `<option value="all">Todos los estados</option>` + STATUS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  });
  renderSchedule(); renderBacklog(); renderProfile(); refreshStatus();
  $('#login').hidden = true;
  $('#app').hidden = false;
}

function loginError(err) {
  const msg = err.status === 401 ? 'Token inválido o vencido. Revisa que lo copiaste completo.' : err.message;
  const el = $('#login-error');
  el.textContent = msg; el.hidden = false;
}

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const tok = $('#token').value.trim();
  if (!tok) return loginError(new Error('Pega tu token de GitHub.'));
  const btn = $('#login-btn');
  btn.disabled = true; btn.textContent = 'Verificando…'; $('#login-error').hidden = true;
  try { await startApp(tok, $('#remember').checked); }
  catch (err) { loginError(err); }
  finally { btn.disabled = false; btn.textContent = 'Entrar'; }
});

(async function autoLogin() {
  const saved = localStorage.getItem(STORE_KEY) || sessionStorage.getItem(STORE_KEY);
  if (!saved) return;
  $('#login-btn').textContent = 'Entrando…';
  try { await startApp(saved, !!localStorage.getItem(STORE_KEY)); }
  catch (err) {
    localStorage.removeItem(STORE_KEY); sessionStorage.removeItem(STORE_KEY);
    loginError(err);
  } finally { $('#login-btn').textContent = 'Entrar'; }
})();

/* Reloj de la barra de tareas */
(function clock() {
  const el = $('#taskbar-clock');
  const timezone = $('#timezone-label');
  if (timezone) timezone.textContent = `🌍 ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  const tick = () => { const n = new Date(); el.textContent = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'); };
  tick(); setInterval(tick, 30000);
})();