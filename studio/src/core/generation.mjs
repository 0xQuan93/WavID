import { buildWavIdProductionDefinition, canonicalSha256 } from './production-definition.mjs';
import { validateCheckpoint, validateTimestamp } from './validation.mjs';

const validMeasure = value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;


// Validate new browser observations before using the unchanged production mapper.
// A public observation is eligible for a preview; it is never proof of control.
export function validateArtist(artist) {
  if (!artist || typeof artist !== 'object' || Array.isArray(artist)) throw new Error('Artist must be a record');
  if (typeof artist.displayName !== 'string' || !artist.displayName.trim() || artist.displayName.length > 200) throw new Error('Artist display name must be nonempty text up to 200 characters');
  if (artist?.eligibility?.canBirth !== true) throw new Error(artist?.eligibility?.reason || 'Artist is not eligible for generation');
  const handle = artist.identity?.audiusHandle;
  if (typeof handle !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(handle) || artist.artistKey !== `wavewarz:audius:${handle.toLocaleLowerCase('en-US')}`) {
    throw new Error('A stable, matching Audius identity is required');
  }
  if (!Array.isArray(artist.songs) || !artist.songs.length || artist.songs.length > 500) throw new Error('One to 500 reconciled songs are required');
  const seen = new Set();
  for (const song of artist.songs) {
    if (!song || typeof song !== 'object' || Array.isArray(song)) throw new Error('Song must be a record');
    for (const field of ['songTitle', 'artistName', 'genre']) {
      if (song[field] != null && (typeof song[field] !== 'string' || song[field].length > 500)) throw new Error(`Song ${field} must be bounded text`);
    }
    if (song.sourceValid === false) throw new Error('Song contains invalid source data');
    for (const field of ['battles', 'wins', 'losses', 'totalUniqueTraders']) {
      if (!Number.isSafeInteger(song[field]) || song[field] < 0) throw new Error(`Song ${field} must be a nonnegative integer`);
    }
    if (!validMeasure(song.totalVolumeSol) || !validMeasure(song.winRate) || song.winRate > 100 || song.battles !== song.wins + song.losses) {
      throw new Error('Song statistics do not reconcile');
    }
    validateTimestamp(song.lastPlayed, 'Song last-played date', true);
    let url;
    if (typeof song.musicLink !== 'string' || song.musicLink.length > 2048) throw new Error('Song requires a bounded Audius track URL');
    try { url = new URL(song.musicLink); } catch { throw new Error('Song requires an Audius track URL'); }
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.origin !== 'https://audius.co' || url.username || url.password || parts.length !== 2 || parts[0].toLowerCase() !== handle.toLowerCase()) {
      throw new Error('Song is outside the stable Audius identity');
    }
    const track = `${url.origin}/${parts[0].toLowerCase()}/${parts[1]}`;
    if (seen.has(track)) throw new Error('Duplicate Audius track in source');
    seen.add(track);
  }
  const quick = artist.quickBattle;
  if (!quick || quick.indexedSongs !== artist.songs.length) throw new Error('Indexed song count does not reconcile');
  for (const field of ['battles', 'wins', 'losses']) {
    if (!Number.isSafeInteger(quick[field]) || quick[field] !== artist.songs.reduce((sum, song) => sum + song[field], 0)) {
      throw new Error(`Aggregate ${field} does not reconcile`);
    }
  }
  const volume = Number(artist.songs.reduce((sum, song) => sum + song.totalVolumeSol, 0).toFixed(4));
  if (!validMeasure(quick.totalVolumeSol) || !validMeasure(volume) || Math.abs(quick.totalVolumeSol - volume) > 0.000001) throw new Error('Aggregate volume does not reconcile');
  if (!validMeasure(quick.winRate) || quick.winRate > 100) throw new Error('Aggregate win rate is invalid');
  if (!Number.isSafeInteger(quick.summedSongLevelTraderSlots) || quick.summedSongLevelTraderSlots !== artist.songs.reduce((sum, song) => sum + song.totalUniqueTraders, 0)) throw new Error('Aggregate trader slots do not reconcile');
  validateTimestamp(quick.lastPlayed, 'Aggregate last-played date', true);
  return artist;
}

export function generateDefinition(artist, options = {}) {
  validateArtist(artist);
  options = validateCheckpoint({ checkedAt: new Date().toISOString(), sources: [], ...options });
  const checkedAt = options.checkedAt;
  const source = {
    schema: 'artistos-wavid-birth-source/0.1.0',
    rosterSnapshotSha256: options.rosterSnapshotSha256 || null,
    rosterCheckedAt: checkedAt,
    sources: options.sources || [],
    artist: structuredClone(artist),
  };
  const sourceHash = canonicalSha256(source);
  const revision = options.revision || 1;
  const birthRecord = {
    id: `browser-${artist.identity.audiusHandle.toLowerCase()}-${sourceHash.slice(0, 12).toLowerCase()}`,
    root: `wavid:browser-preview:${artist.artistKey}`,
    lineage: { revision },
    source: { canonicalSha256: sourceHash, rosterSnapshotSha256: source.rosterSnapshotSha256, checkedAt, freshness: options.freshness || 'browser-observation' },
    boundaries: { privateReviewOnly: true, artistControlProven: false, canon: false, publication: false, mint: false, utility: false, approvalInheritance: false },
  };
  const { props, genome, sourceReference, metadata } = buildWavIdProductionDefinition({ source, birthRecord });
  return { schema: 'wavid-browser-definition/1.0.0', status: 'unclaimed-preview', source, birthRecord, props, genome, sourceReference, metadata };
}
