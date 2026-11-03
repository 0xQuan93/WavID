// Card paths match roster artists the same way the studio does after Load roster.
// artistKey is wavewarz:audius:<handle>, with the handle lowercased using en-US.
// When no artist key matches, a unique display name or handle that compacts to
// the same letters and digits can open that artist. /wavid/card/oxquan reaches
// OxQuan (_0xQuan) that way. An exact artist key always wins.

import { handleFromArtist, resolveAudiusProfile } from './payload.mjs';

const AMBIGUOUS = 'More than one roster artist matches this path. Open the card with the Audius handle.';

export function compactCardAlias(value) {
  return String(value ?? '').toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');
}

export function findCardArtist(artists, route) {
  if (!route?.ok) return null;
  const list = Array.isArray(artists) ? artists : [];
  const keyed = list.filter((entry) => entry?.artistKey === route.artistKey);
  if (keyed.length) {
    const exact = keyed.find((entry) => handleFromArtist(entry));
    return exact ? { artist: exact, match: 'artist-key' } : null;
  }
  const alias = compactCardAlias(route.handle);
  if (!alias) return null;
  const hits = list.filter((entry) => {
    const handle = handleFromArtist(entry);
    if (!handle) return false;
    return compactCardAlias(handle) === alias || compactCardAlias(entry.displayName) === alias;
  });
  if (hits.length === 1) return { artist: hits[0], match: 'display-alias' };
  if (hits.length > 1) return { artist: null, match: 'ambiguous' };
  return null;
}

function emptyDecision(route, source) {
  return {
    ok: route.ok,
    route,
    artist: null,
    profile: route,
    match: null,
    canPreview: false,
    reason: route.ok ? null : route.reason,
    source,
    alias: false,
  };
}

export function resolveCardArtist({ handle = '', artist = null, roster = null } = {}) {
  const route = resolveAudiusProfile({ handle });
  if (!route.ok) return emptyDecision(route, 'none');
  const fromArtist = artist ? findCardArtist([artist], route) : null;
  const fromRoster = fromArtist?.artist || !roster ? null : findCardArtist(roster.artists, route);
  if (!fromArtist?.artist && fromRoster?.match === 'ambiguous') {
    return {
      ok: true,
      route,
      artist: null,
      profile: route,
      match: 'ambiguous',
      canPreview: false,
      reason: AMBIGUOUS,
      source: 'roster',
      alias: false,
    };
  }
  const found = fromArtist?.artist ? fromArtist : fromRoster;
  const matched = found?.artist || null;
  if (!matched) return emptyDecision(route, artist ? 'artist' : roster ? 'roster' : 'none');
  const profile = resolveAudiusProfile({ artist: matched });
  const eligible = matched.eligibility?.canBirth === true && profile.ok && Boolean(handleFromArtist(matched));
  const reason = eligible
    ? null
    : (typeof matched.eligibility?.reason === 'string' && matched.eligibility.reason.trim()
      ? matched.eligibility.reason.trim()
      : (profile.ok ? 'This artist is not eligible for a material-v1 preview.' : profile.reason));
  return {
    ok: true,
    route,
    artist: matched,
    profile: profile.ok ? profile : route,
    match: found.match,
    canPreview: Boolean(eligible),
    reason,
    source: fromArtist?.artist ? 'artist' : 'roster',
    alias: Boolean(profile.ok && profile.artistKey !== route.artistKey),
  };
}

export function shouldFetchPublicRoster({ artist = null, roster = null, frozenArtists = null, handle = '' } = {}) {
  if (artist || roster) return false;
  const route = resolveAudiusProfile({ handle });
  if (!route.ok) return false;
  if (Array.isArray(frozenArtists) && findCardArtist(frozenArtists, route)?.artist) return false;
  return true;
}
