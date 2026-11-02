// WavID card payload, wavid-card/1.0.
// After a scan, the app opens {origin}/wavid/card/{audiusHandle}.
// The static studio reads the same path from the hash: {origin}/#/wavid/card/{handle}.
// The card page links to https://audius.co/{handle}. A later NFC tag can store this same URL.
// The printed card face stores the handle in the artwork (wavid-wave-code/1), not in a QR square.

export const CARD_CONTRACT = 'wavid-card/1.0';
export const DEFAULT_PUBLIC_BASE_URL = 'https://wavewarz.info';
export const SCAN_PATH = '/wavid/scan';
export const CARD_PATH_PREFIX = '/wavid/card/';
export const CARD_QR_LEVEL = 'Q';

const HANDLE = /^(?!\.$|\.\.$)[a-zA-Z0-9_.-]{1,100}$/;
const MAX_PAYLOAD = 2048;

const REASONS = {
  'not-text': 'Card payload must be text.',
  empty: 'Card payload is empty.',
  'too-long': 'Card payload is too long.',
  'bad-url': 'Card payload is not an http(s) link or path.',
  credentials: 'Card links cannot carry a username or password.',
  'not-card': 'This code is not a WavID card link.',
  'no-handle': 'No Audius handle is present.',
  'bad-handle': 'That handle is not a stable Audius identity.',
  'key-mismatch': 'The artist key does not match the Audius handle.',
  'handle-mismatch': 'That handle does not match this artist.',
  ineligible: 'This artist is not eligible for a material-v1 card.',
};

export function isAudiusHandle(value) {
  return typeof value === 'string' && HANDLE.test(value);
}

export function artistKeyForHandle(handle) {
  if (!isAudiusHandle(handle)) return null;
  return `wavewarz:audius:${handle.toLocaleLowerCase('en-US')}`;
}

function unresolved(code, reason = REASONS[code] || REASONS['not-card']) {
  return {
    ok: false,
    code,
    reason,
    handle: null,
    artistKey: null,
    audiusUrl: null,
    cardPath: null,
  };
}

function resolved(handle) {
  return {
    ok: true,
    code: 'resolved',
    reason: null,
    handle,
    artistKey: artistKeyForHandle(handle),
    audiusUrl: `https://audius.co/${encodeURIComponent(handle)}`,
    cardPath: `${CARD_PATH_PREFIX}${encodeURIComponent(handle)}`,
  };
}

function isLocalDemoHost(hostname) {
  const host = String(hostname || '').toLocaleLowerCase('en-US');
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true;
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const nums = parts.map(Number);
  if (nums.some((part) => part > 255)) return false;
  const [a, b] = nums;
  if (a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function isLocalDemoOrigin(input) {
  try {
    const url = new URL(String(input).trim());
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && isLocalDemoHost(url.hostname)
      && (!url.pathname || url.pathname === '/')
      && !url.search
      && !url.hash
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export function normalizePublicBaseUrl(input = DEFAULT_PUBLIC_BASE_URL) {
  const value = input == null || String(input).trim() === '' ? DEFAULT_PUBLIC_BASE_URL : String(input).trim();
  if (value.length > 200) throw new Error('Public card base URL is too long.');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Public card base URL must be an absolute http(s) origin.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Public card base URL must use http or https.');
  if (url.username || url.password) throw new Error('Public card base URL cannot carry a username or password.');
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new Error('Public card base URL must be an origin, without a path, query, or hash.');
  }
  if (url.protocol === 'http:' && !isLocalDemoHost(url.hostname)) {
    throw new Error('Card links use HTTPS except for localhost and private-network demo hosts.');
  }
  return url.origin;
}

export function encodeCardUrl({ handle, publicBaseUrl = DEFAULT_PUBLIC_BASE_URL, studioHash = false } = {}) {
  if (!isAudiusHandle(handle)) throw new Error('A card link needs a stable Audius handle.');
  const origin = normalizePublicBaseUrl(publicBaseUrl);
  const path = `${CARD_PATH_PREFIX}${encodeURIComponent(handle)}`;
  const payload = studioHash ? `${origin}/#${path}` : `${origin}${path}`;
  if (payload.length > 512) throw new Error('Card link is too long to encode on a printed QR.');
  return payload;
}

function normalizePath(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '/';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.split('?')[0].split('#')[0];
}

function extractRoutePath(input) {
  const raw = input.trim();
  if (!raw) return { error: 'empty' };
  if (raw.length > MAX_PAYLOAD) return { error: 'too-long' };
  if (raw.startsWith('#')) return { path: normalizePath(raw.slice(1)) };
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return { error: 'bad-url' };
    }
    if (url.username || url.password) return { error: 'credentials' };
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'bad-url' };
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : '';
    const hashPath = hash ? normalizePath(hash) : '';
    if (/^\/wavid\/card(?:\/|$)/i.test(hashPath) || /^\/wavid\/scan\/?$/i.test(hashPath)) return { path: hashPath };
    return { path: normalizePath(url.pathname) };
  }
  return { path: normalizePath(raw) };
}

export function decodeCardPayload(input) {
  if (typeof input !== 'string') return unresolved('not-text');
  const extracted = extractRoutePath(input);
  if (extracted.error) return unresolved(extracted.error);
  const path = extracted.path;
  if (/^\/wavid\/card\/?$/i.test(path)) return unresolved('no-handle');
  const match = path.match(/^\/wavid\/card\/([^/]+)\/?$/i);
  if (!match) return unresolved('not-card');
  let handle;
  try {
    handle = decodeURIComponent(match[1]);
  } catch {
    return unresolved('bad-handle');
  }
  if (!isAudiusHandle(handle)) return unresolved('bad-handle');
  return resolved(handle);
}

// Audius identity comes only from https://audius.co/<handle>, matching the battle observer.
export function handleFromMusicLink(musicLink) {
  if (typeof musicLink !== 'string' || musicLink.length > MAX_PAYLOAD) return null;
  let url;
  try {
    url = new URL(musicLink);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.hostname.toLocaleLowerCase('en-US') !== 'audius.co') return null;
  const handle = url.pathname.split('/').filter(Boolean)[0];
  return isAudiusHandle(handle) ? handle : null;
}

export function handleFromArtist(artist) {
  if (!artist || typeof artist !== 'object' || Array.isArray(artist)) return null;
  const handle = artist.identity?.audiusHandle;
  if (!isAudiusHandle(handle)) return null;
  if (artist.artistKey !== artistKeyForHandle(handle)) return null;
  return handle;
}

export function resolveAudiusProfile({ handle, artist, payload } = {}) {
  if (payload != null) {
    if (typeof payload !== 'string') return unresolved('not-text');
    return decodeCardPayload(payload);
  }
  if (artist) {
    const found = handleFromArtist(artist);
    if (!found) {
      const raw = artist.identity?.audiusHandle;
      if (raw == null || raw === '') return unresolved('no-handle');
      if (!isAudiusHandle(raw)) return unresolved('bad-handle');
      return unresolved('key-mismatch');
    }
    if (handle != null && handle !== '' && String(handle).toLocaleLowerCase('en-US') !== found.toLocaleLowerCase('en-US')) {
      return unresolved('handle-mismatch');
    }
    return resolved(found);
  }
  if (handle == null || handle === '') return unresolved('no-handle');
  if (typeof handle !== 'string') return unresolved('bad-handle');
  if (!isAudiusHandle(handle)) return unresolved('bad-handle');
  return resolved(handle);
}

export function parseCardRoute(input) {
  if (input == null || input === '') return { name: 'studio' };
  if (typeof input !== 'string') return { name: 'invalid', ...unresolved('not-text') };
  const extracted = extractRoutePath(input);
  if (extracted.error) return { name: 'invalid', ...unresolved(extracted.error) };
  if (/^\/wavid\/scan\/?$/i.test(extracted.path)) return { name: 'scan' };
  if (/^\/wavid\/card(?:\/|$)/i.test(extracted.path)) return { name: 'card', ...decodeCardPayload(extracted.path) };
  return { name: 'studio' };
}

export function studioHashFor(route) {
  if (route?.name === 'scan') return '#/wavid/scan';
  if (route?.name === 'card' && isAudiusHandle(route.handle)) return `#${CARD_PATH_PREFIX}${encodeURIComponent(route.handle)}`;
  return '#/';
}
