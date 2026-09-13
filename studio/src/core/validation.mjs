const SHA256 = /^[0-9A-F]{64}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };

export function checkKeys(value, allowed, label) {
  if (!record(value)) fail(`${label} must be a record`);
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${label} contains unsupported fields`);
}

// Date.parse accepts February 30 and local-zone timestamps. Require an actual
// calendar date with an explicit zone, retaining API microseconds verbatim.
export function validateTimestamp(value, label, nullable = false) {
  if (nullable && value == null) return null;
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/);
  if (!match || value.length > 40) fail(`${label} must be an ISO timestamp with a timezone`);
  const [, year, month, day, hour, minute, second, zone] = match;
  const leap = +year % 4 === 0 && (+year % 100 !== 0 || +year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (+month < 1 || +month > 12 || +day < 1 || +day > days[+month - 1] || +hour > 23 || +minute > 59 || +second > 59
    || (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59)) || !Number.isFinite(Date.parse(value))) {
    fail(`${label} must be a valid calendar timestamp`);
  }
  return value;
}

function shortText(value, label, fallback = 'unknown') {
  if (value == null) return fallback;
  if (typeof value !== 'string' || value.length > 120 || /[\x00-\x1f]/.test(value)) fail(`${label} must be short text`);
  return value;
}

export function validateCheckpoint(checkpoint) {
  checkKeys(checkpoint, ['checkedAt', 'rosterSnapshotSha256', 'sources', 'revision', 'freshness'], 'Checkpoint');
  const checkedAt = validateTimestamp(checkpoint.checkedAt, 'Checkpoint date');
  const rosterSnapshotSha256 = checkpoint.rosterSnapshotSha256 ?? null;
  if (rosterSnapshotSha256 !== null && (typeof rosterSnapshotSha256 !== 'string' || !SHA256.test(rosterSnapshotSha256))) fail('Roster fingerprint must be an uppercase SHA-256');
  if (!Array.isArray(checkpoint.sources) || checkpoint.sources.length > 8) fail('Checkpoint must have at most eight public API sources');
  const sources = checkpoint.sources.map(source => {
    checkKeys(source, ['uri', 'freshness', 'retrievedAt', 'apiUpdatedAt'], 'API source');
    if (typeof source.uri !== 'string' || source.uri.length > 2048) fail('API source URL is invalid');
    let url;
    try { url = new URL(source.uri); } catch { fail('API source URL is invalid'); }
    if (url.origin !== 'https://wavewarz.info' || url.username || url.password || !url.pathname.startsWith('/api/public/') || url.hash) {
      fail('API source must be an official WaveWarz public HTTPS URL');
    }
    return {
      uri: source.uri,
      freshness: shortText(source.freshness, 'Source freshness'),
      retrievedAt: validateTimestamp(source.retrievedAt, 'Source retrieval date', true),
      apiUpdatedAt: validateTimestamp(source.apiUpdatedAt, 'API update date', true),
    };
  });
  const result = { checkedAt, rosterSnapshotSha256, sources };
  if (checkpoint.revision !== undefined) {
    if (!Number.isSafeInteger(checkpoint.revision) || checkpoint.revision < 1) fail('Revision must be a positive integer');
    result.revision = checkpoint.revision;
  }
  if (checkpoint.freshness !== undefined) result.freshness = shortText(checkpoint.freshness, 'Checkpoint freshness');
  return result;
}
