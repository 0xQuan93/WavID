// On-card playback uses public Audius permalinks already stored on the roster.
// No WaveWarz API is added. A missing or rejected resolve leaves the permalink
// and does not invent a stream.

import { isAudiusHandle } from './payload.mjs';

export const AUDIUS_APP_NAME = 'wavid-browser-studio';

export function tracksForArtist(artist, handle) {
  if (!artist || typeof artist !== 'object' || !isAudiusHandle(handle)) return [];
  const want = handle.toLocaleLowerCase('en-US');
  const songs = Array.isArray(artist.songs) ? artist.songs : [];
  const seen = new Set();
  const tracks = [];
  for (const song of songs) {
    const link = song?.musicLink;
    if (typeof link !== 'string') continue;
    let url;
    try {
      url = new URL(link);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' || url.hostname.toLocaleLowerCase('en-US') !== 'audius.co') continue;
    if (url.username || url.password) continue;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) continue;
    let trackHandle;
    let slug;
    try {
      trackHandle = decodeURIComponent(parts[0]);
      slug = decodeURIComponent(parts[1]);
    } catch {
      continue;
    }
    if (!isAudiusHandle(trackHandle) || trackHandle.toLocaleLowerCase('en-US') !== want) continue;
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(slug)) continue;
    const permalink = `https://audius.co/${encodeURIComponent(trackHandle)}/${encodeURIComponent(slug)}`;
    if (seen.has(permalink)) continue;
    seen.add(permalink);
    const title = typeof song.songTitle === 'string' && song.songTitle.trim() ? song.songTitle.trim() : slug;
    tracks.push({ title, permalink, slug });
  }
  return tracks;
}

export function audiusResolveUrl(permalink) {
  return `https://api.audius.co/v1/resolve?url=${encodeURIComponent(permalink)}&app_name=${AUDIUS_APP_NAME}`;
}

export function playbackFromResolve(permalink, body, responseUrl) {
  const data = body && typeof body === 'object' && body.data && !Array.isArray(body.data) ? body.data : null;
  if (!data || data.id == null) return null;
  const id = String(data.id);
  if (!/^[A-Za-z0-9]{2,32}$/.test(id)) return null;
  let trackHandle = '';
  try {
    trackHandle = decodeURIComponent(new URL(permalink).pathname.split('/').filter(Boolean)[0] || '');
  } catch {
    return null;
  }
  const owner = data.user?.handle;
  if (typeof owner === 'string' && owner.toLocaleLowerCase('en-US') !== trackHandle.toLocaleLowerCase('en-US')) return null;
  let origin = 'https://api.audius.co';
  try {
    const host = new URL(responseUrl);
    if (host.protocol === 'https:') origin = host.origin;
  } catch {
    // Keep the public Audius API origin when the response URL is unusable.
  }
  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : null;
  return {
    id,
    title,
    permalink,
    streamUrl: `${origin}/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${AUDIUS_APP_NAME}`,
    embedUrl: `https://audius.co/embed/track/${encodeURIComponent(id)}?flavor=compact`,
  };
}

export async function resolveAudiusTrack(permalink) {
  const response = await fetch(audiusResolveUrl(permalink));
  if (!response.ok) return null;
  const body = await response.json();
  return playbackFromResolve(permalink, body, response.url);
}
