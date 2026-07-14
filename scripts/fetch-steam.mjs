// ============================================================
// scripts/fetch-steam.mjs
// Corre dentro de un GitHub Action (Node 20+, fetch nativo).
// Lee STEAM_API_KEY y STEAM_ID desde variables de entorno
// (configuradas como Secrets del repo) y genera
// data/backlog-steam.json con las horas jugadas de cada juego.
//
// Nunca imprime ni commitea la API key — solo el resultado.
// ============================================================

const API_KEY  = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

if (!API_KEY || !STEAM_ID) {
  console.error('Faltan STEAM_API_KEY y/o STEAM_ID como variables de entorno.');
  process.exit(1);
}

const url =
  `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/` +
  `?key=${API_KEY}&steamid=${STEAM_ID}&include_appinfo=1&include_played_free_games=1&format=json`;

async function main() {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Steam API respondió ${res.status}. ¿Perfil público? ¿Key válida?`);
  }

  const data = await res.json();
  const games = data?.response?.games || [];

  if (games.length === 0) {
    console.warn('⚠️  0 juegos recibidos — revisa que "Detalles del juego" sea público en tu perfil de Steam.');
  }

  const out = {
    updated: new Date().toISOString(),
    games: {}
  };

  for (const g of games) {
    out.games[g.appid] = {
      name: g.name,
      playtimeForeverMinutes: g.playtime_forever,
      playtime2WeeksMinutes: g.playtime_2weeks || 0,
      iconUrl: g.img_icon_url
        ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
        : null,
      headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`
    };
  }

  const fs = await import('node:fs/promises');
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/backlog-steam.json', JSON.stringify(out, null, 2) + '\n');

  console.log(`✅ backlog-steam.json generado con ${games.length} juegos.`);
}

main().catch(err => {
  console.error('❌ Error obteniendo datos de Steam:', err.message);
  process.exit(1);
});
