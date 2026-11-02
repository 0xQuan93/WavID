import {
  CARD_CONTRACT,
  CARD_QR_LEVEL,
  encodeCardUrl,
  resolveAudiusProfile,
} from './payload.mjs';

export const CARD_FACE_SCHEMA = 'wavid-card-face/1.0';
export const CARD_POSTER_FRAME = 88;

export function cardFaceLayout() {
  const width = 1080;
  const height = 1680;
  return {
    schema: CARD_FACE_SCHEMA,
    contract: CARD_CONTRACT,
    width,
    height,
    errorCorrectionLevel: CARD_QR_LEVEL,
    regions: {
      header: { x: 72, y: 56, width: 936, height: 60 },
      art: { x: 72, y: 132, width: 936, height: 936 },
      title: { x: 72, y: 1092, width: 936, height: 88 },
      qr: { x: 380, y: 1204, width: 320, height: 320 },
      caption: { x: 72, y: 1548, width: 936, height: 84 },
    },
  };
}

function refused(code, reason, displayName = null) {
  return {
    ok: false,
    code,
    reason,
    handle: null,
    artistKey: null,
    audiusUrl: null,
    cardPath: null,
    payload: null,
    displayName,
  };
}

export function cardFaceForArtist(artist, { publicBaseUrl, studioHash = false } = {}) {
  if (!artist || typeof artist !== 'object' || Array.isArray(artist) || artist.eligibility?.canBirth !== true) {
    const reason = artist && typeof artist === 'object' && typeof artist.eligibility?.reason === 'string' && artist.eligibility.reason.trim()
      ? artist.eligibility.reason.trim()
      : 'This artist is not eligible for a material-v1 card.';
    return refused('ineligible', reason);
  }
  const identity = resolveAudiusProfile({ artist });
  if (!identity.ok) return refused(identity.code, identity.reason, artist.displayName || null);
  let payload;
  try {
    payload = encodeCardUrl({ handle: identity.handle, publicBaseUrl, studioHash });
  } catch (error) {
    return refused('bad-base', error.message, artist.displayName || null);
  }
  const layout = cardFaceLayout();
  return {
    ok: true,
    code: 'resolved',
    reason: null,
    schema: layout.schema,
    contract: layout.contract,
    handle: identity.handle,
    artistKey: identity.artistKey,
    audiusUrl: identity.audiusUrl,
    cardPath: identity.cardPath,
    payload,
    displayName: typeof artist.displayName === 'string' ? artist.displayName : identity.handle,
    width: layout.width,
    height: layout.height,
    regions: layout.regions,
    errorCorrectionLevel: layout.errorCorrectionLevel,
  };
}

export function cardKitReadme(spec) {
  if (!spec?.ok || typeof spec.payload !== 'string' || typeof spec.audiusUrl !== 'string' || !spec.audiusUrl.startsWith('https://audius.co/')) {
    throw new Error('A card kit needs a resolved Audius handle.');
  }
  return [
    'WavID card kit',
    '',
    'Scan the QR code on card.png, or open this URL:',
    spec.payload,
    '',
    'That page links to this Audius profile:',
    spec.audiusUrl,
    '',
    `Artist key: ${spec.artistKey}`,
    `Display name: ${spec.displayName}`,
    '',
    'identity.json is the portable material-v1 definition for the still on the card.',
    'Import it into WavID Studio to reproduce the checkpoint. card.png is a browser',
    'composite of that still plus the QR. Its pixels can differ by device. Printing',
    'the card does not change material-v1 seeds, formulas, or fixture hashes.',
    '',
    'This file is unsigned. It does not prove artist control or platform approval.',
    '',
    'A later NFC tag can store the same URL as an NDEF URI record. This kit does not write NFC.',
    '',
  ].join('\n');
}
