// ============================================================
// scripts/fetch-steam.mjs
// Corre dentro de un GitHub Action (Node 20+, fetch nativo).
// Lee STEAM_API_KEY y STEAM_ID desde variables de entorno
// (configuradas como Secrets del repo) y genera
// data/backlog-steam.json con horas jugadas + logros de cada
// juego que tenga un "appid" configurado en data/backlog.json.
//
// Nunca imprime ni commitea la API key — solo el resultado.
// ============================================================

const API_KEY  = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

/* RetroAchievements es opcional — si no están configurados los secrets, se omite sin error */
const RA_USERNAME = process.env.RA_USERNAME;
const RA_API_KEY  = process.env.RA_API_KEY;

if (!API_KEY || !STEAM_ID) {
  console.error('Faltan STEAM_API_KEY y/o STEAM_ID como variables de entorno.');
  process.exit(1);
}

const OWNED_GAMES_URL =
  `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/` +
  `?key=${API_KEY}&steamid=${STEAM_ID}&include_appinfo=1&include_played_free_games=1&format=json`;

function achievementsUrl(appid) {
  return `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/` +
    `?appid=${appid}&key=${API_KEY}&steamid=${STEAM_ID}&format=json`;
}
function schemaUrl(appid) {
  return `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/` +
    `?appid=${appid}&key=${API_KEY}&format=json`;
}

async function safeJson(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

/* Lee data/backlog.json del repo checkeado para saber qué appids/raGameIds necesitan logros */
async function getTrackedIds() {
  const fs = await import('node:fs/promises');
  try {
    const raw = await fs.readFile('data/backlog.json', 'utf-8');
    const data = JSON.parse(raw);
    const games = data.games || [];
    return {
      appIds: [...new Set(games.filter(g => g.platform === 'steam' && g.appid).map(g => g.appid))],
      raGameIds: [...new Set(games.filter(g => g.raGameId).map(g => g.raGameId))],
    };
  } catch (err) {
    console.warn('No se pudo leer data/backlog.json, sin logros esta vez:', err.message);
    return { appIds: [], raGameIds: [] };
  }
}

async function fetchAchievementsForGame(appid) {
  const [playerData, schemaData] = await Promise.all([
    safeJson(achievementsUrl(appid)),
    safeJson(schemaUrl(appid)),
  ]);

  const playerAch = playerData?.playerstats;
  if (!playerAch?.success || !Array.isArray(playerAch.achievements)) return null; // juego sin logros o perfil privado

  const schemaAch = schemaData?.game?.availableGameStats?.achievements || [];
  const schemaByName = Object.fromEntries(schemaAch.map(a => [a.name, a]));

  const merged = playerAch.achievements.map(a => {
    const schema = schemaByName[a.apiname] || {};
    return {
      name: schema.displayName || a.apiname,
      achieved: !!a.achieved,
      unlocktime: a.unlocktime || 0,
      icon: a.achieved ? (schema.icon || null) : (schema.icongray || schema.icon || null),
    };
  }).filter(a => a.icon);

  // Logros conseguidos primero (más recientes arriba), luego los bloqueados
  merged.sort((a, b) => {
    if (a.achieved !== b.achieved) return a.achieved ? -1 : 1;
    return b.unlocktime - a.unlocktime;
  });

  const unlocked = merged.filter(a => a.achieved).length;
  if (merged.length === 0) return null;

  return { total: merged.length, unlocked, icons: merged };
}

async function fetchRetroAchievementsForGame(gameId) {
  const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php` +
    `?g=${gameId}&u=${RA_USERNAME}&y=${RA_API_KEY}`;
  const data = await safeJson(url);
  if (!data?.Achievements) return null;

  const merged = Object.values(data.Achievements).map(a => {
    const achieved = !!a.DateEarned;
    return {
      name: a.Title,
      achieved,
      unlocktime: achieved ? Date.parse(a.DateEarned + ' UTC') / 1000 : 0,
      icon: `https://media.retroachievements.org/Badge/${a.BadgeName}${achieved ? '' : '_lock'}.png`,
    };
  });

  merged.sort((a, b) => {
    if (a.achieved !== b.achieved) return a.achieved ? -1 : 1;
    return b.unlocktime - a.unlocktime;
  });

  const unlocked = merged.filter(a => a.achieved).length;
  if (merged.length === 0) return null;

  return { total: merged.length, unlocked, icons: merged };
}

async function main() {
  const ownedRes = await fetch(OWNED_GAMES_URL);
  if (!ownedRes.ok) {
    throw new Error(`Steam API respondió ${ownedRes.status}. ¿Perfil público? ¿Key válida?`);
  }
  const ownedData = await ownedRes.json();
  const games = ownedData?.response?.games || [];

  if (games.length === 0) {
    console.warn('⚠️  0 juegos recibidos — revisa que "Detalles del juego" sea público en tu perfil de Steam.');
  }

  const out = { updated: new Date().toISOString(), games: {}, achievements: {}, retroAchievements: {} };

  for (const g of games) {
    out.games[g.appid] = {
      name: g.name,
      playtimeForeverMinutes: g.playtime_forever,
      playtime2WeeksMinutes: g.playtime_2weeks || 0,
      lastPlayedUnix: g.rtime_last_played || null,
      iconUrl: g.img_icon_url
        ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
        : null,
      headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`
    };
  }

  const { appIds: trackedAppIds, raGameIds: trackedRaGameIds } = await getTrackedIds();
  console.log(`🏆 Buscando logros de Steam para ${trackedAppIds.length} juego(s) trackeado(s)...`);

  for (const appid of trackedAppIds) {
    try {
      const ach = await fetchAchievementsForGame(appid);
      if (ach) {
        out.achievements[appid] = ach;
        console.log(`   ✓ appid ${appid}: ${ach.unlocked}/${ach.total} logros`);
      } else {
        console.log(`   – appid ${appid}: sin logros disponibles`);
      }
    } catch (err) {
      console.warn(`   ⚠️  Error obteniendo logros de appid ${appid}:`, err.message);
    }
  }

  if (RA_USERNAME && RA_API_KEY && trackedRaGameIds.length > 0) {
    console.log(`🕹️  Buscando logros de RetroAchievements para ${trackedRaGameIds.length} juego(s)...`);
    for (const gameId of trackedRaGameIds) {
      try {
        const ach = await fetchRetroAchievementsForGame(gameId);
        if (ach) {
          out.retroAchievements[gameId] = ach;
          console.log(`   ✓ RA game ${gameId}: ${ach.unlocked}/${ach.total} logros`);
        } else {
          console.log(`   – RA game ${gameId}: sin datos`);
        }
      } catch (err) {
        console.warn(`   ⚠️  Error obteniendo logros de RA game ${gameId}:`, err.message);
      }
    }
  } else if (trackedRaGameIds.length > 0) {
    console.log('ℹ️  Hay juegos con raGameId pero no están configurados RA_USERNAME/RA_API_KEY — se omiten.');
  }

  const fs = await import('node:fs/promises');
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/backlog-steam.json', JSON.stringify(out, null, 2) + '\n');

  console.log(`✅ backlog-steam.json generado: ${games.length} juegos, ${Object.keys(out.achievements).length} con logros Steam, ${Object.keys(out.retroAchievements).length} con logros RA.`);
}

main().catch(err => {
  console.error('❌ Error obteniendo datos de Steam:', err.message);
  process.exit(1);
});
