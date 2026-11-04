// View anchors for the card HUD. Reads material-v1 anatomy and the same
// song→band order as describeProvenance. Does not change seeds, formulas, or hashes.
// Screen position is the anatomy point after body aspect, rotation, and scale,
// placed on the 1080 square the renderer uses (center 540, radius 370).

const VIEW = 1080;
const CENTER = 540;
const RADIUS = 370;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function formatSol(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n);
}

function formatRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n)}%`;
}

export function httpsUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function xProfile(handle) {
  const raw = String(handle ?? '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(raw)) return null;
  return { handle: raw, url: `https://x.com/${raw}` };
}

export function mainEventSummary(artist) {
  const main = artist?.mainEvent;
  if (!main || typeof main !== 'object') return null;
  if (main.status !== 'matched-by-public-name' && main.status !== 'observed') return null;
  if (!Number.isSafeInteger(main.wins) || !Number.isSafeInteger(main.losses)) return null;
  return {
    status: main.status,
    wins: main.wins,
    losses: main.losses,
    battles: Number.isSafeInteger(main.battles) ? main.battles : main.wins + main.losses,
  };
}

export function readCardIdentity(artist) {
  return {
    x: xProfile(artist?.identity?.xHandle),
    avatar: httpsUrl(artist?.profile?.imageUrl),
    main: mainEventSummary(artist),
  };
}

export function projectAnatomyPoint(point, body = {}) {
  const aspect = clamp(Number(body.aspect) || 1, 0.72, 1.38);
  const aspectX = Math.sqrt(aspect);
  const aspectY = 1 / aspectX;
  const bodyScale = clamp(Number(body.scale) || 1, 0.86, 1.08);
  const rotation = Number(body.rotation) || 0;
  const x0 = (Number(point?.x) || 0) * aspectX;
  const y0 = (Number(point?.y) || 0) * aspectY;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const x = (x0 * cosine - y0 * sine) * bodyScale;
  const y = (x0 * sine + y0 * cosine) * bodyScale;
  return {
    x: clamp(CENTER + x * RADIUS, 0, VIEW),
    y: clamp(CENTER + y * RADIUS, 0, VIEW),
  };
}

function anchorPoint(anchor, anatomy) {
  if (!anchor || typeof anchor !== 'object') return { x: 0, y: 0 };
  if (typeof anchor.x === 'number' && typeof anchor.y === 'number') return { x: anchor.x, y: anchor.y };
  const list = anchor.kind === 'node' ? anatomy.nodes : anatomy.cavities;
  return list?.[anchor.index]?.center || { x: 0, y: 0 };
}

function bandPoint(band, anatomy) {
  const from = anchorPoint(band.from, anatomy);
  const to = anchorPoint(band.to, anatomy);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = clamp(Number(band.bend) || 0, -0.24, 0.24);
  const control = band.control && typeof band.control.x === 'number' && typeof band.control.y === 'number'
    ? band.control
    : {
      x: (from.x + to.x) / 2 + (-dy / length) * bend,
      y: (from.y + to.y) / 2 + (dx / length) * bend,
    };
  return {
    x: 0.25 * from.x + 0.5 * control.x + 0.25 * to.x,
    y: 0.25 * from.y + 0.5 * control.y + 0.25 * to.y,
  };
}

function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function rankedSongs(artist) {
  return [...(artist?.songs || [])].sort((a, b) => b.totalVolumeSol - a.totalVolumeSol || String(a.musicLink).localeCompare(String(b.musicLink)));
}

const FORM_SLOTS = {
  band: { x: 250, y: 250, align: 'left' },
  node: { x: 830, y: 280, align: 'right' },
  cavity: { x: 830, y: 540, align: 'right' },
};

export function calloutLabelBox(callout, reveal) {
  if (reveal === 'form' && FORM_SLOTS[callout.kind]) return { ...FORM_SLOTS[callout.kind] };
  const anchor = callout.anchor;
  const left = anchor.x < CENTER;
  const x = left ? Math.min(anchor.x - 28, 300) : Math.max(anchor.x + 28, 780);
  return {
    x: clamp(x, 210, 870),
    y: clamp(anchor.y, 150, 860),
    align: left ? 'left' : 'right',
  };
}

export function buildAnatomyCallouts(definition) {
  const artist = definition?.source?.artist;
  const anatomy = definition?.props?.anatomy;
  const quick = artist?.quickBattle;
  if (!artist || !anatomy || !quick || !Array.isArray(anatomy.bands)) return [];
  const body = anatomy.body || {};
  const songs = rankedSongs(artist);
  if (!songs.length) return [];
  const callouts = [];

  anatomy.bands.forEach((band, index) => {
    const song = songs[index % songs.length];
    const anchor = projectAnatomyPoint(bandPoint(band, anatomy), body);
    callouts.push({
      id: `band:${index}`,
      kind: 'band',
      index,
      anchor,
      hit: 64,
      songTitle: song.songTitle,
      musicLink: song.musicLink,
      volumeSol: song.totalVolumeSol,
      battles: song.battles,
      wins: song.wins,
      losses: song.losses,
      kicker: 'Song',
      title: song.songTitle,
      detail: `${formatSol(song.totalVolumeSol)} SOL · ${song.wins}W / ${song.losses}L`,
      aria: `Band ${index + 1}. Song ${song.songTitle}. Quick Battle volume ${formatSol(song.totalVolumeSol)} SOL. Record ${countLabel(song.wins, 'win', 'wins')}, ${countLabel(song.losses, 'loss', 'losses')}, ${countLabel(song.battles, 'battle', 'battles')}.`,
    });
  });

  (anatomy.nodes || []).forEach((node, index) => {
    const anchor = projectAnatomyPoint(node.center, body);
    const polarity = node.polarity === 1 ? 'positive' : 'negative';
    callouts.push({
      id: `node:${index}`,
      kind: 'node',
      index,
      anchor,
      hit: Math.max(64, Math.abs(Number(node.radius) || 0) * RADIUS),
      battles: quick.battles,
      wins: quick.wins,
      losses: quick.losses,
      polarity,
      kicker: 'Battle activity',
      title: `${formatSol(quick.battles)} battles`,
      detail: '',
      aria: `Node ${index + 1}. Battle activity ${countLabel(quick.battles, 'battle', 'battles')}, ${countLabel(quick.wins, 'win', 'wins')}, ${countLabel(quick.losses, 'loss', 'losses')}. Polarity ${polarity}. Node count follows battle activity.`,
    });
  });

  (anatomy.cavities || []).forEach((cavity, index) => {
    const anchor = projectAnatomyPoint(cavity.center, body);
    callouts.push({
      id: `cavity:${index}`,
      kind: 'cavity',
      index,
      anchor,
      hit: Math.max(72, Math.max(Math.abs(Number(cavity.radii?.x) || 0), Math.abs(Number(cavity.radii?.y) || 0)) * RADIUS),
      winRate: quick.winRate,
      wins: quick.wins,
      losses: quick.losses,
      songs: quick.indexedSongs,
      volumeSol: quick.totalVolumeSol,
      kicker: 'Win ratio',
      title: formatRate(quick.winRate),
      detail: `${quick.wins}W / ${quick.losses}L · ${quick.indexedSongs} songs`,
      aria: `Cavity ${index + 1}. Win ratio ${formatRate(quick.winRate)}, ${countLabel(quick.wins, 'win', 'wins')} and ${countLabel(quick.losses, 'loss', 'losses')}. Catalog ${countLabel(quick.indexedSongs, 'song', 'songs')}. Quick Battle volume ${formatSol(quick.totalVolumeSol)} SOL feeds cavity source strength and does not represent income.`,
    });
  });

  return callouts;
}

export function visibleCallouts(callouts, reveal) {
  if (!reveal || !Array.isArray(callouts) || !callouts.length) return [];
  if (reveal === 'form') {
    return ['band', 'node', 'cavity'].map((kind) => callouts.find((entry) => entry.kind === kind)).filter(Boolean);
  }
  return callouts.filter((entry) => entry.id === reveal);
}
