import { validateTimestamp } from '../core/validation.mjs';
import { BATTLE_OVERLAY_ID } from './overlay-v0.mjs';

export const OBSERVATION_SCHEMA = 'wavewarz-live-battle-observation/0';
export const DELAY_LABEL = 'observed every ~30s · delayed';
const HANDLE = /^(?!\.$|\.\.$)[a-zA-Z0-9_.-]{1,100}$/;
const TRACK = /^[a-zA-Z0-9_.-]{1,200}$/;

const text = (value, max) => {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned) return null;
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
};

function httpsHost(value, hostname) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname.toLocaleLowerCase('en-US') !== hostname) return null;
    return url;
  } catch {
    return null;
  }
}

export function artistKeyFromMusicLink(musicLink) {
  const url = httpsHost(musicLink, 'audius.co');
  if (!url) return null;
  const [handle, track] = url.pathname.split('/').filter(Boolean);
  if (!handle || !HANDLE.test(handle)) return null;
  const safeTrack = track && TRACK.test(track) ? track : null;
  const encodedHandle = encodeURIComponent(handle);
  return {
    handle,
    artistKey: `wavewarz:audius:${handle.toLocaleLowerCase('en-US')}`,
    profileUrl: `https://audius.co/${encodedHandle}`,
    trackUrl: safeTrack ? `https://audius.co/${encodedHandle}/${encodeURIComponent(safeTrack)}` : null,
  };
}

function solAmount(value) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) return null;
  return parsed;
}

function voteCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sidePick(value) {
  return value === 'artist1' || value === 'artist2' ? value : null;
}

function stamp(value) {
  if (typeof value !== 'string') return null;
  try {
    return validateTimestamp(value, 'Battle timestamp');
  } catch {
    return null;
  }
}

function battlePageUrl(value, battleId) {
  const direct = httpsHost(value, 'wavewarz.info');
  if (direct && /^\/battles\/[A-Za-z0-9_-]{1,64}\/?$/.test(direct.pathname)) return direct.origin + direct.pathname.replace(/\/$/, '');
  if (typeof battleId === 'number' && Number.isSafeInteger(battleId) && battleId >= 0) return `https://wavewarz.info/battles/${battleId}`;
  if (typeof battleId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(battleId)) return `https://wavewarz.info/battles/${battleId}`;
  return null;
}

function normalizeSide(raw, id) {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const identity = artistKeyFromMusicLink(record.musicLink);
  return {
    id,
    label: text(record.name, 200) || 'Unnamed side',
    // Preserve published base58 wallet case. Off-platform musicLink values
    // never become hrefs or artist keys; only https://audius.co identities do.
    wallet: text(record.wallet, 120),
    musicLink: identity?.trackUrl || identity?.profileUrl || null,
    artistKey: identity?.artistKey || null,
    audiusHandle: identity?.handle || null,
    poolSol: solAmount(record.poolSol),
    volumeSol: solAmount(record.volumeSol),
    resolved: Boolean(identity),
  };
}

function normalizeFactors(raw) {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    pollWinner: sidePick(record.pollWinner),
    pollVotesArtist1: voteCount(record.pollVotesArtist1),
    pollVotesArtist2: voteCount(record.pollVotesArtist2),
    djWavyWinner: sidePick(record.djWavyWinner),
    djWavyReasoning: text(record.djWavyReasoning, 280),
    humanJudgeWinner: sidePick(record.humanJudgeWinner),
    xPollWinner: sidePick(record.xPollWinner),
    solVoteWinner: sidePick(record.solVoteWinner),
  };
}

function battleIdOf(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)) return value;
  return null;
}

function normalizeBattle(raw) {
  const winnerSide = sidePick(raw.winnerSide);
  const battleId = battleIdOf(raw.battleId);
  const type = raw.type === 'quick' || raw.type === 'main' || raw.type === 'community' ? raw.type : 'unknown';
  return {
    battleId,
    type,
    live: true,
    winnerDecided: raw.winnerDecided === true && Boolean(winnerSide),
    winnerSide: raw.winnerDecided === true ? winnerSide : null,
    createdAt: stamp(raw.createdAt),
    endsAt: stamp(raw.endsAt),
    url: battlePageUrl(raw.url, battleId),
    sides: {
      artist1: normalizeSide(raw.artist1 ?? raw.sides?.artist1 ?? raw.sides?.[0], 'artist1'),
      artist2: normalizeSide(raw.artist2 ?? raw.sides?.artist2 ?? raw.sides?.[1], 'artist2'),
    },
    factors: normalizeFactors(raw.factors),
  };
}

function sampleShell(checkedAt, payload, status, battle, liveCount) {
  return {
    schema: OBSERVATION_SCHEMA,
    checkedAt,
    sourceUpdatedAt: stamp(payload.updatedAt),
    status,
    battle,
    liveCount,
    delayLabel: DELAY_LABEL,
    realtime: false,
    overlay: BATTLE_OVERLAY_ID,
  };
}

export function parseLiveBattleResponse(payload, { checkedAt } = {}) {
  const stamped = validateTimestamp(checkedAt, 'Battle observation');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Live battle response was not an object.');
  if (payload.battles != null && !Array.isArray(payload.battles)) throw new Error('Live battle response did not include a battle list.');
  const battles = Array.isArray(payload.battles) ? payload.battles : [];
  const live = battles.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) && entry.live === true);
  if (!live.length) return sampleShell(stamped, payload, 'empty', null, 0);
  return sampleShell(stamped, payload, 'live', normalizeBattle(live[0]), live.length);
}

export function resolveBattleArtists(battle, artists = []) {
  if (!battle?.sides) return [];
  const list = Array.isArray(artists) ? artists : [];
  return ['artist1', 'artist2'].map((id) => {
    const side = battle.sides[id];
    const found = side.artistKey ? list.find((entry) => entry?.artistKey === side.artistKey) || null : null;
    const canRender = found?.eligibility?.canBirth === true;
    let unresolvedReason = null;
    if (!side.resolved) unresolvedReason = 'No Audius track link on this side. Wallet-only or off-platform links stay unresolved.';
    else if (!found) unresolvedReason = 'This Audius identity is not in the current roster snapshot.';
    else if (!canRender) unresolvedReason = found.eligibility?.reason || 'This identity cannot generate a material-v1 form.';
    return { side, artist: canRender ? found : null, unresolvedReason };
  });
}

export function chartsLean(battle) {
  const left = battle?.sides?.artist1?.poolSol;
  const right = battle?.sides?.artist2?.poolSol;
  if (left == null || right == null || left === right) return null;
  return left > right ? 'artist1' : 'artist2';
}

export function factorLines(battle) {
  if (!battle) return [];
  const name = (id) => battle.sides?.[id]?.audiusHandle || battle.sides?.[id]?.label || id;
  const factors = battle.factors || {};
  const lines = [];
  if (factors.pollWinner || factors.pollVotesArtist1 != null || factors.pollVotesArtist2 != null) {
    const votes = factors.pollVotesArtist1 != null || factors.pollVotesArtist2 != null
      ? ` · ${factors.pollVotesArtist1 ?? 0}–${factors.pollVotesArtist2 ?? 0}`
      : '';
    lines.push({ key: 'poll', text: `Poll · ${factors.pollWinner ? name(factors.pollWinner) : 'not recorded'}${votes}` });
  }
  const lean = chartsLean(battle);
  if (lean) lines.push({ key: 'charts', text: `Larger pool · ${name(lean)} · charts factor, not the result` });
  if (factors.djWavyWinner || factors.djWavyReasoning) lines.push({ key: 'dj', text: `DJ Wavy · ${factors.djWavyWinner ? name(factors.djWavyWinner) : 'not recorded'}` });
  if (factors.humanJudgeWinner) lines.push({ key: 'judge', text: `Human judge · ${name(factors.humanJudgeWinner)}` });
  if (factors.xPollWinner) lines.push({ key: 'xpoll', text: `X poll · ${name(factors.xPollWinner)}` });
  if (factors.solVoteWinner) lines.push({ key: 'sol', text: `SOL vote · ${name(factors.solVoteWinner)}` });
  if (battle.winnerDecided && battle.winnerSide) lines.push({ key: 'winner', text: `Recorded winner · ${name(battle.winnerSide)}` });
  return lines;
}

export function formatObservationClock(endsAt, nowMs) {
  const end = Date.parse(endsAt || '');
  if (!Number.isFinite(end) || !Number.isFinite(nowMs)) return 'End time not in the last observation';
  const delta = end - nowMs;
  if (delta <= 0) return 'Window elapsed in the last observation';
  const total = Math.floor(delta / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const body = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
  return `${body} left in the last observation`;
}

export function battleResultPlan(observation, artists = []) {
  const battle = observation?.status === 'live' ? observation.battle : null;
  if (!battle?.winnerDecided || !battle.winnerSide) return null;
  const side = battle.sides?.[battle.winnerSide];
  if (!side) return null;
  const winner = resolveBattleArtists(battle, artists).find((entry) => entry.side.id === battle.winnerSide);
  return {
    action: 'refresh-roster-snapshot',
    autoMutate: false,
    winnerSide: battle.winnerSide,
    artistKey: side.artistKey,
    label: side.audiusHandle || side.label,
    overlay: BATTLE_OVERLAY_ID,
    altersMaterialV1: false,
    beforeAfter: {
      available: Boolean(winner?.artist),
      method: 'compareCheckpoints',
      invoke: 'explicit',
      note: 'Hold the current portable export, refresh the leaderboard snapshot, then compareCheckpoints for this artistKey. This plan does not call compare or mutate a snapshot.',
    },
  };
}

export function chooseRefreshFocus(nextArtists, { currentKey, focusArtistKey } = {}) {
  const list = Array.isArray(nextArtists) ? nextArtists : [];
  const eligible = (key) => Boolean(key) && list.some((entry) => entry?.artistKey === key && entry?.eligibility?.canBirth === true);
  if (eligible(focusArtistKey)) return focusArtistKey;
  if (eligible(currentKey)) return currentKey;
  return list.find((entry) => entry?.eligibility?.canBirth === true)?.artistKey || '';
}
