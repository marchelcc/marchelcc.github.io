'use strict';

/* ─────────────────────────────────────────────────────────────
   CONFIG
   ───────────────────────────────────────────────────────────── */
const ALLOWED_GITHUB_USER = 'marchelcc';
const SESSION_KEY         = 'marchel_admin_token';

/* ─────────────────────────────────────────────────────────────
   IN-MEMORY STATE
   ───────────────────────────────────────────────────────────── */
let state = {
    vtuber: 'Marchel',
    tagline: '🎣 El pescador de los mares digitales',
    lastUpdated: new Date().toISOString().slice(0,10),
    profilePic: '',
    youtubeLatestVideoId: '',
    youtubeLatestVODId: '',
    schedule: [],
    rotationGames: [],
    socials: {}
};
let scheduleIdCounter = 100;
let rotationIdCounter = 100;

const TAG_OPTIONS = ['Stream Longo', 'Stream Shorti','Colab','Nuevo Video','Off'];
const DAY_OPTIONS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

/* ─────────────────────────────────────────────────────────────
   AUTH — GITHUB TOKEN LOGIN
   Calls api.github.com/user with the token and checks
   that the returned login === ALLOWED_GITHUB_USER.
   The token is stored in sessionStorage (clears on tab close).
   ───────────────────────────────────────────────────────────── */
async function doLogin() {
    const input  = document.getElementById('token-input');
    const btn    = document.getElementById('login-btn');
    const errEl  = document.getElementById('login-error');
    const errMsg = document.getElementById('login-error-msg');
    const bar    = document.getElementById('login-status-bar');
    const token  = input.value.trim();

    if (!token) {
        showLoginError('Por favor ingresa tu GitHub Personal Access Token.');
        input.classList.add('error');
        setTimeout(() => input.classList.remove('error'), 600);
        return;
    }

    // Loading state
    btn.innerHTML = '<span class="login-spinner"></span> Verificando...';
    btn.disabled  = true;
    errEl.classList.remove('show');
    bar.innerHTML = '🔄 Conectando con GitHub API...';

    try {
        const res = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json'
            }
        });

        if (!res.ok) {
            throw new Error(res.status === 401
                ? 'Token inválido. Verifica que copiaste el token completo.'
                : `Error de GitHub API: ${res.status}`);
        }

        const user = await res.json();

        if (user.login.toLowerCase() !== ALLOWED_GITHUB_USER.toLowerCase()) {
            throw new Error(`Cuenta "${user.login}" no tiene acceso. Solo marchelcc puede entrar.`);
        }

        // ✅ Success — store token in sessionStorage and show admin
        sessionStorage.setItem(SESSION_KEY, token);
        sessionStorage.setItem('marchel_admin_user', user.login);
        showAdminPanel(user.login);

    } catch (err) {
        showLoginError(err.message);
        btn.innerHTML = '🔓 Entrar';
        btn.disabled  = false;
        input.classList.add('error');
        setTimeout(() => input.classList.remove('error'), 600);
        bar.innerHTML = '❌ Fallo de autenticación';
    }
}

function showLoginError(msg) {
    const errEl  = document.getElementById('login-error');
    const errMsg = document.getElementById('login-error-msg');
    errMsg.textContent = msg;
    errEl.classList.add('show');
}

function showAdminPanel(username) {
    document.getElementById('login-overlay').style.display   = 'none';
    document.getElementById('admin-desktop').style.display   = 'flex';
    document.getElementById('session-user').textContent      = username;

    loadData();
}

function doLogout() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('marchel_admin_user');
    window.location.reload();
}

// Allow pressing Enter in the token field
document.getElementById('token-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
});

/* ─────────────────────────────────────────────────────────────
   AUTO-LOGIN if session token already exists
   ───────────────────────────────────────────────────────────── */
(function checkSession() {
    const token = sessionStorage.getItem(SESSION_KEY);
    const user  = sessionStorage.getItem('marchel_admin_user');
    if (token && user) {
        showAdminPanel(user);
    }
})();

/* ─────────────────────────────────────────────────────────────
   LOAD DATA
   ───────────────────────────────────────────────────────────── */
async function loadData() {
    try {
        const res  = await fetch('data/schedule.json?nocache=' + Date.now());
        const data = await res.json();

        state.vtuber        = data.vtuber      || 'Marchel';
        state.tagline       = data.tagline     || '';
        state.lastUpdated   = data.lastUpdated || new Date().toISOString().slice(0,10);
        state.profilePic    = data.profilePic  || '';
        state.youtubeLatestVideoId = data.youtubeLatestVideoId || '';
        state.youtubeLatestVODId   = data.youtubeLatestVODId   || '';
        state.schedule      = data.schedule      || [];
        state.rotationGames = data.rotationGames || [];
        state.socials       = data.socials       || {};

        renderAll();
        updateStatus();
        setStatus('✅ schedule.json cargado correctamente');
    } catch (err) {
        setStatus('⚠️ No se pudo cargar schedule.json');
        console.error(err);
    }
}

/* ─────────────────────────────────────────────────────────────
   RENDER ALL TABS
   ───────────────────────────────────────────────────────────── */
function renderAll() {
    renderScheduleAdmin();
    renderRotationAdmin();
    renderMetaForm();
}

/* ── Schedule table ── */
function renderScheduleAdmin() {
    const tbody = document.getElementById('schedule-admin-body');
    tbody.innerHTML = '';

    state.schedule.forEach((item, idx) => {
        const tr = document.createElement('tr');

        const dayOpts = DAY_OPTIONS.map(d =>
            `<option value="${d}" ${d === item.day ? 'selected' : ''}>${d}</option>`
        ).join('');
        const tagOpts = TAG_OPTIONS.map(t =>
            `<option value="${t}" ${t === item.tag ? 'selected' : ''}>${t}</option>`
        ).join('');

        const logoSrc    = item.imageUrl || '';
        const imgPreview = logoSrc && !logoSrc.includes('your-')
            ? `<img src="${logoSrc}" onerror="this.style.display='none'" />`
            : '';
        const timeVal = item.time ?? '';

        tr.innerHTML = `
          <td class="admin-col-active">
            <input type="checkbox" class="active-toggle" ${item.active ? 'checked' : ''}
              onchange="updateScheduleField(${idx}, 'active', this.checked)" />
          </td>
          <td><select onchange="updateScheduleField(${idx}, 'day', this.value)">${dayOpts}</select></td>
          <td><input type="text" value="${timeVal}" placeholder="19:00"
               onchange="updateScheduleField(${idx}, 'time', this.value || null)" /></td>
          <td><input type="text" value="${item.game || ''}" placeholder="Nombre del juego"
               onchange="updateScheduleField(${idx}, 'game', this.value)" /></td>
          <td>
            <div class="logo-preview-cell">
              ${imgPreview}
              <input type="url" value="${logoSrc}"
                placeholder="https://i.imgur.com/..."
                onchange="updateScheduleField(${idx}, 'imageUrl', this.value); refreshLogoPreview(this)" />
            </div>
          </td>
          <td><select onchange="updateScheduleField(${idx}, 'tag', this.value)">${tagOpts}</select></td>
          <td class="admin-col-actions">
            <button class="xp-button success admin-slot-btn"
              title="Agregar otro slot para este mismo día"
              onclick="addSlotAfter(${idx})">+⏰</button>
            <button class="xp-button danger admin-slot-btn"
              onclick="removeScheduleRow(${idx})">🗑️</button>
          </td>
        `;
        tbody.appendChild(tr);
    });
}

/* ── Rotation cards ── */
function renderRotationAdmin() {
    const grid = document.getElementById('rotation-admin-grid');
    grid.innerHTML = '';

    state.rotationGames.forEach((game, idx) => {
        const card = document.createElement('div');
        card.className = 'rotation-admin-card';

        const logoSrc = game.imageUrl || '';
        const hasLogo = logoSrc && !logoSrc.includes('your-');

        card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:13px;">Juego ${idx+1}</strong>
        <button class="xp-button danger" onclick="removeRotationGame(${idx})"
          style="padding:2px 8px;font-size:11px;">🗑️ Quitar</button>
      </div>
      <div class="card-preview">
        <img id="rot-preview-${idx}"
          src="${hasLogo ? logoSrc : ''}"
          style="${hasLogo ? '' : 'display:none'}"
          onerror="this.style.display='none'"
          alt="preview" />
        <span>${hasLogo ? game.name : (game.emoji + ' ' + game.name)}</span>
      </div>
      <label>Emoji (fallback)</label>
      <input type="text" value="${game.emoji}" placeholder="🎮"
        onchange="updateRotationField(${idx}, 'emoji', this.value)" />
      <label>Nombre del juego</label>
      <input type="text" value="${game.name}" placeholder="Stardew Valley"
        onchange="updateRotationField(${idx}, 'name', this.value)" />
      <label>Logo imgur URL</label>
      <input type="url" value="${logoSrc}" placeholder="https://i.imgur.com/..."
        onchange="updateRotationField(${idx}, 'imageUrl', this.value); updateRotPreview(${idx}, this.value)" />
      <label>Nota / descripción</label>
      <input type="text" value="${game.note}" placeholder="Farm arc activo"
        onchange="updateRotationField(${idx}, 'note', this.value)" />
    `;
        grid.appendChild(card);
    });
}

/* ── Meta form (info general + profile pic + YouTube ID) ── */
function renderMetaForm() {
    const form = document.getElementById('meta-form');
    const picSrc = state.profilePic || '';
    const hasRealPic = picSrc && !picSrc.includes('your-profile-pic');

    form.innerHTML = `
    <div class="full-span">
      <label>URL de foto de perfil (imgur, formato 1:1)</label>
      <input type="url" value="${picSrc}"
        placeholder="https://i.imgur.com/tu-foto-de-perfil.png"
        oninput="state.profilePic = this.value; updateProfilePicPreview(this.value)" />
    </div>
    <div>
      <label>Nombre del VTuber</label>
      <input type="text" value="${state.vtuber}" onchange="state.vtuber = this.value" />
    </div>
    <div>
      <label>Tagline</label>
      <input type="text" value="${state.tagline}" onchange="state.tagline = this.value" />
    </div>
    <div>
      <label>Fecha de actualización</label>
      <input type="date" value="${state.lastUpdated}" onchange="state.lastUpdated = this.value" />
    </div>
    <div class="full-span">
      <label>🎬 Último video de YouTube (ID)</label>
      <input type="text" value="${state.youtubeLatestVideoId || ''}"
        placeholder="Ej: dQw4w9WgXcQ"
        onchange="state.youtubeLatestVideoId = this.value" />

      <label style="margin-top:8px;">📼 Último VOD de YouTube (ID)</label>
      <input type="text" value="${state.youtubeLatestVODId || ''}"
        placeholder="Ej: rHJ6IgUTu1k"
        onchange="state.youtubeLatestVODId = this.value" />

      <label style="margin-top:8px;">YouTube VODs URL</label>
      <input type="url" value="${state.socials.youtubevods || ''}"
        placeholder="https://www.youtube.com/@marchel-vods1"
        onchange="state.socials.youtubevods = this.value" />
   
      <div style="font-size:10px; color:#666; margin-top:2px;">
        El ID es la parte después de <code>watch?v=</code> en la URL del video. Ejemplo: de <code>https://www.youtube.com/watch?v=ABC123</code> el ID es <code>ABC123</code>.
      </div>
    </div>
    <div>
      <label>Twitch URL</label>
      <input type="url" value="${state.socials.twitch || ''}"
        placeholder="https://www.twitch.tv/marchel_cc"
        onchange="state.socials.twitch = this.value" />
    </div>
    <div>
      <label>YouTube URL</label>
      <input type="url" value="${state.socials.youtube || ''}"
        placeholder="https://www.youtube.com/@Marchel-cc"
        onchange="state.socials.youtube = this.value" />
    </div>
    <div>
      <label>Twitter / X URL</label>
      <input type="url" value="${state.socials.twitter || ''}"
        placeholder="https://x.com/Marchel_cc"
        onchange="state.socials.twitter = this.value" />
    </div>
    <div>
      <label>BlueSky URL</label>
      <input type="url" value="${state.socials.bsky || ''}"
        placeholder="https://bsky.app/profile/marchelcc.bsky.social"
        onchange="state.socials.bsky = this.value" />
    </div>
  `;

    // Seed the preview
    if (hasRealPic) updateProfilePicPreview(picSrc);
}

/* ── Live profile pic preview in admin ── */
function updateProfilePicPreview(url) {
    const frame    = document.querySelector('.profile-pic-preview-wrap .mini-frame');
    const fallback = document.getElementById('profile-mini-fallback');
    if (!frame) return;

    // Remove any old img
    const old = frame.querySelector('img');
    if (old) old.remove();
    if (fallback) fallback.style.display = 'flex';

    if (!url || url.includes('your-')) return;

    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Profile preview';
    img.style.display = 'none';
    img.onload = () => {
        if (fallback) fallback.style.display = 'none';
        img.style.display = 'block';
    };
    img.onerror = () => img.remove();
    frame.appendChild(img);
}

/* ── Live logo preview helpers ── */
function refreshLogoPreview(inputEl) {
    const cell = inputEl.closest('.logo-preview-cell');
    if (!cell) return;
    let img = cell.querySelector('img');
    const url = inputEl.value.trim();
    if (!url) { if (img) img.remove(); return; }
    if (!img) {
        img = document.createElement('img');
        img.onerror = () => img.style.display = 'none';
        cell.prepend(img);
    }
    img.src = url;
    img.style.display = 'block';
}

function updateRotPreview(idx, url) {
    const img = document.getElementById(`rot-preview-${idx}`);
    if (!img) return;
    if (!url) { img.style.display = 'none'; return; }
    img.src = url;
    img.style.display = 'block';
}

/* ─────────────────────────────────────────────────────────────
   FIELD UPDATERS
   ───────────────────────────────────────────────────────────── */
function updateScheduleField(idx, field, value) { state.schedule[idx][field] = value; }
function updateRotationField(idx, field, value)  { state.rotationGames[idx][field] = value; }

/* ─────────────────────────────────────────────────────────────
   ADD / REMOVE
   ───────────────────────────────────────────────────────────── */
function addScheduleRow() {
    state.schedule.push({
        id: scheduleIdCounter++,
        day: 'Lunes', time: '19:00',
        game: 'Nuevo stream', imageUrl: '', tag: 'Stream Longo', active: true
    });
    renderScheduleAdmin();
    setStatus('✅ Fila agregada');
}

/* Add a second (or third…) time slot right below the row at idx,
   inheriting the same day so they appear grouped in the public view. */
function addSlotAfter(idx) {
    const sourceDay = state.schedule[idx]?.day || 'Lunes';
    const newSlot = {
        id: scheduleIdCounter++,
        day: sourceDay, time: '21:00',
        game: 'Nuevo slot', imageUrl: '', tag: 'Stream Shorti', active: true
    };
    /* Insert immediately after idx so it renders right below */
    state.schedule.splice(idx + 1, 0, newSlot);
    renderScheduleAdmin();
    setStatus(`✅ Slot extra añadido para ${sourceDay}`);
}
function removeScheduleRow(idx) {
    state.schedule.splice(idx, 1);
    renderScheduleAdmin();
    setStatus('🗑️ Fila eliminada');
}
function addRotationGame() {
    state.rotationGames.push({
        id: rotationIdCounter++, name: 'Nuevo Juego',
        emoji: '🎮', imageUrl: '', note: 'Descripción'
    });
    renderRotationAdmin();
    switchTab('tab-rotation', document.querySelectorAll('.tab')[1]);
    setStatus('✅ Juego agregado');
}
function removeRotationGame(idx) {
    state.rotationGames.splice(idx, 1);
    renderRotationAdmin();
    setStatus('🗑️ Juego eliminado');
}

/* ─────────────────────────────────────────────────────────────
   JSON GENERATION & EXPORT
   ───────────────────────────────────────────────────────────── */
function buildJson() {
    state.lastUpdated = new Date().toISOString().slice(0,10);
    return JSON.stringify(state, null, 2);
}

function showJsonTab() {
    document.getElementById('json-preview-content').textContent = buildJson();
    switchTab('tab-json', document.querySelectorAll('.tab')[3]);
}

function exportJson() {
    const json = buildJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'data/schedule.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('💾 schedule.json descargado correctamente');
    setStatus('✅ JSON exportado');
    document.getElementById('json-preview-content').textContent = json;
}

async function copyJson() {
    try {
        await navigator.clipboard.writeText(buildJson());
        showToast('📋 JSON copiado al portapapeles');
    } catch {
        showToast('⚠️ No se pudo copiar — usa el botón de exportar');
    }
}

/* ─────────────────────────────────────────────────────────────
   TAB SWITCHING
   ───────────────────────────────────────────────────────────── */
function switchTab(panelId, tabEl) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');
    if (tabEl)  tabEl.classList.add('active');
    if (panelId === 'tab-json') showJsonTab();
}

/* ─────────────────────────────────────────────────────────────
   UI HELPERS
   ───────────────────────────────────────────────────────────── */
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}
function setStatus(msg) {
    document.getElementById('admin-status').textContent = msg;
}
function updateStatus() {
    const total  = state.schedule.length;
    const active = state.schedule.filter(s => s.active).length;
    document.getElementById('admin-count-status').textContent =
        `${active} días activos / ${total} días   · ${state.rotationGames.length} juegos en rotación`;
}

/* ─────────────────────────────────────────────────────────────
   XP WINDOW BUTTONS (decorative)
   ───────────────────────────────────────────────────────────── */
document.querySelectorAll('.xp-btn-close').forEach(btn => {
    btn.addEventListener('click', e => {
        const win = e.target.closest('.xp-window');
        if (!win) return;
        win.style.transition = 'transform 0.2s, opacity 0.2s';
        win.style.transform  = 'scale(0.97)';
        win.style.opacity    = '0.6';
        setTimeout(() => { win.style.transform = ''; win.style.opacity = ''; }, 300);
    });
});

/* ─────────────────────────────────────────────────────────────
   CLOCK
   ───────────────────────────────────────────────────────────── */
(function startClock() {
    const el = document.getElementById('taskbar-clock');
    if (!el) return;
    function tick() {
        const n = new Date();
        el.textContent = String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
    }
    tick(); setInterval(tick, 30000);
})();