import { canonicalSha256 } from './production-definition.mjs';
import { validateArtist } from './generation.mjs';
import { validateTimestamp } from './validation.mjs';
const API_BASE = 'https://wavewarz.info/api/public';
const ROSTER_SCHEMA = 'artistos-wavewarz-wavid-roster/1.0';
const text = (value) => String(value ?? '').trim();
const key = (value) => text(value).toLocaleLowerCase('en-US');
const number = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const integer = (value) => Math.max(0, Math.trunc(number(value)));
const round = (value, digits = 4) => Number(Number(value || 0).toFixed(digits));
function safeSlug(value) {
  const candidate = text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return candidate || `artist-${canonicalSha256(text(value)).slice(0, 10).toLowerCase()}`;
}

function audiusIdentity(musicLink) {
  try {
    const url = new URL(text(musicLink));
    if (url.protocol !== 'https:' || key(url.hostname) !== 'audius.co') return null;
    const handle = url.pathname.split('/').filter(Boolean)[0];
    if (!handle) return null;
    return { handle, normalizedHandle: key(handle) };
  } catch {
    return null;
  }
}

function chooseDisplayName(songs, fallback) {
  const counts = new Map();
  for (const song of songs) {
    const name = text(song.artistName);
    if (!name) continue;
    const normalized = key(name);
    const current = counts.get(normalized) || { name, count: 0 };
    current.count += 1;
    counts.set(normalized, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0]?.name || fallback;
}

function normalizedSong(song) {
  const countFieldsValid = ['battles', 'wins', 'losses', 'totalUniqueTraders']
    .every((field) => Number.isSafeInteger(Number(song?.[field] ?? 0)) && Number(song?.[field] ?? 0) >= 0);
  const measureFieldsValid = ['winRate', 'totalVolumeSol']
    .every((field) => Number.isFinite(Number(song?.[field] ?? 0)) && Number(song?.[field] ?? 0) >= 0 && Number(song?.[field] ?? 0) <= Number.MAX_SAFE_INTEGER)
    && Number(song?.winRate ?? 0) <= 100;
  return {
    songTitle: text(song?.songTitle),
    artistName: text(song?.artistName) || null,
    musicLink: text(song?.musicLink),
    genre: text(song?.genre) || 'Unspecified',
    artUrl: text(song?.artUrl) || null,
    battles: integer(song?.battles),
    wins: integer(song?.wins),
    losses: integer(song?.losses),
    winRate: number(song?.winRate),
    totalVolumeSol: round(number(song?.totalVolumeSol)),
    totalUniqueTraders: integer(song?.totalUniqueTraders),
    lastPlayed: text(song?.lastPlayed) || null,
    sourceValid: countFieldsValid && measureFieldsValid
  };
}

function normalizedMainArtist(artist) {
  return {
    wallet: text(artist?.wallet) || null,
    name: text(artist?.name),
    wins: integer(artist?.wins),
    losses: integer(artist?.losses),
    draws: integer(artist?.draws),
    battles: integer(artist?.battles),
    winRate: number(artist?.winRate),
    totalVolumeSol: round(number(artist?.totalVolumeSol)),
    totalEarningsSol: round(number(artist?.totalEarningsSol)),
    pfpUrl: text(artist?.pfpUrl) || null,
    xHandle: text(artist?.twitterHandle) || null
  };
}

function mainArtistScore(group, artist) {
  const names = new Set(group.songs.map((song) => key(song.artistName)).filter(Boolean));
  if (names.has(key(artist.name))) return 3;
  if (key(group.handle) === key(artist.name)) return 2;
  return 0;
}

export function buildRosterSnapshot({ artistsPayload, songsPayload, retrievedAt = new Date().toISOString() }) {
  validateTimestamp(retrievedAt, 'Roster retrieval date');
  const artistRows = Array.isArray(artistsPayload?.artists) ? artistsPayload.artists.map(normalizedMainArtist) : [];
  const songRows = Array.isArray(songsPayload?.songs) ? songsPayload.songs.map(normalizedSong) : [];
  const groups = new Map();
  const unresolvedSongs = [];

  for (const song of songRows) {
    const identity = audiusIdentity(song.musicLink);
    if (!identity) {
      unresolvedSongs.push(song);
      continue;
    }
    const artistKey = `wavewarz:audius:${identity.normalizedHandle}`;
    const group = groups.get(artistKey) || {
      artistKey,
      handle: identity.handle,
      normalizedHandle: identity.normalizedHandle,
      songs: []
    };
    group.songs.push(song);
    groups.set(artistKey, group);
  }

  const matchedMainArtists = new Set();
  const roster = [...groups.values()].map((group) => {
    group.songs.sort((a, b) => b.totalVolumeSol - a.totalVolumeSol || a.musicLink.localeCompare(b.musicLink));
    const displayName = chooseDisplayName(group.songs, group.handle);
    const matches = artistRows
      .map((artist, index) => ({ artist, index, score: mainArtistScore(group, artist) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || b.artist.battles - a.artist.battles);
    const main = matches[0]?.artist || null;
    if (matches[0]) matchedMainArtists.add(matches[0].index);
    const quickBattle = {
      indexedSongs: group.songs.length,
      battles: group.songs.reduce((sum, song) => sum + song.battles, 0),
      wins: group.songs.reduce((sum, song) => sum + song.wins, 0),
      losses: group.songs.reduce((sum, song) => sum + song.losses, 0),
      totalVolumeSol: round(group.songs.reduce((sum, song) => sum + song.totalVolumeSol, 0)),
      summedSongLevelTraderSlots: group.songs.reduce((sum, song) => sum + song.totalUniqueTraders, 0),
      lastPlayed: group.songs.map((song) => song.lastPlayed).filter(Boolean).sort().at(-1) || null
    };
    quickBattle.winRate = quickBattle.battles ? round((quickBattle.wins / quickBattle.battles) * 100, 1) : 0;
    const sourceValid = group.songs.every((song) => song.sourceValid);
    const reconciled = sourceValid && group.songs.every((song) => song.battles === song.wins + song.losses)
      && quickBattle.battles === quickBattle.wins + quickBattle.losses;
    const artist = {
      artistKey: group.artistKey,
      displayName,
      identity: {
        audiusHandle: group.handle,
        xHandle: main?.xHandle || null,
        wallet: main?.wallet || null,
        claimStatus: 'public-roster-observation; artist control not cryptographically proven'
      },
      eligibility: {
        canBirth: reconciled && group.songs.length > 0,
        reason: reconciled
          ? 'stable Audius identity and reconciled Quick Battle record'
          : sourceValid ? 'Quick Battle record does not reconcile' : 'Quick Battle record contains invalid numeric data'
      },
      quickBattle,
      mainEvent: main
        ? { status: 'matched-by-public-name', ...main }
        : { status: 'unobserved', record: null },
      profile: {
        imageUrl: main?.pfpUrl || group.songs.find((song) => song.artUrl)?.artUrl || null
      },
      songs: group.songs
    };
    if (artist.eligibility.canBirth) {
      try { validateArtist(artist); }
      catch (error) { artist.eligibility = { canBirth: false, reason: error.message }; }
    }
    return artist;
  });

  for (const [index, artist] of artistRows.entries()) {
    if (matchedMainArtists.has(index)) continue;
    const stablePart = artist.wallet ? `wallet:${key(artist.wallet)}` : `name:${safeSlug(artist.name)}`;
    roster.push({
      artistKey: `wavewarz:${stablePart}`,
      displayName: artist.name || 'Unresolved artist',
      identity: { audiusHandle: null, xHandle: artist.xHandle, wallet: artist.wallet, claimStatus: 'public-roster-observation; Audius identity unresolved' },
      eligibility: { canBirth: false, reason: 'no stable Audius song identity in the current song roster' },
      quickBattle: { indexedSongs: 0, battles: 0, wins: 0, losses: 0, winRate: 0, totalVolumeSol: 0, summedSongLevelTraderSlots: 0, lastPlayed: null },
      mainEvent: { status: 'observed', ...artist },
      profile: { imageUrl: artist.pfpUrl },
      songs: []
    });
  }

  roster.sort((a, b) => Number(b.eligibility.canBirth) - Number(a.eligibility.canBirth)
    || b.quickBattle.battles - a.quickBattle.battles
    || a.displayName.localeCompare(b.displayName));

  const payload = {
    schema: ROSTER_SCHEMA,
    checkedAt: retrievedAt,
    sources: [
      {
        uri: `${API_BASE}/leaderboards/artists?limit=500`,
        freshness: 'fresh',
        retrievedAt,
        apiUpdatedAt: text(artistsPayload?.updatedAt) || null
      },
      {
        uri: `${API_BASE}/leaderboards/songs?sort=volume&limit=500`,
        freshness: 'fresh',
        retrievedAt,
        apiUpdatedAt: text(songsPayload?.updatedAt) || null
      }
    ],
    counts: {
      artistLeaderboardRows: artistRows.length,
      songLeaderboardRows: songRows.length,
      rosterArtists: roster.length,
      birthEligible: roster.filter((artist) => artist.eligibility.canBirth).length,
      unresolvedSongs: unresolvedSongs.length
    },
    coverage: {
      kind: 'capped-leaderboards',
      requestedLimit: 500,
      completeRoster: false,
      artistLimitReached: artistRows.length >= 500,
      songLimitReached: songRows.length >= 500,
      note: 'Only returned leaderboard rows are observed. Missing artists or songs may be outside these capped results.',
    },
    artists: roster,
    unresolvedSongs
  };
  return { ...payload, snapshotSha256: canonicalSha256(payload) };
}


export const normalizeRoster = (artistsPayload, songsPayload, retrievedAt) => buildRosterSnapshot({ artistsPayload, songsPayload, retrievedAt });
