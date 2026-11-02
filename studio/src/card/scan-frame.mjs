// The camera happy path is the wave code woven into the artwork.
// A legacy QR payload is accepted only when the artwork itself does not decode.

import { decodeCardPayload, resolveAudiusProfile } from './payload.mjs';
import { WAVE_CODE_CONTRACT } from './wave-code.mjs';

const EMPTY = {
  handle: null,
  artistKey: null,
  audiusUrl: null,
  cardPath: null,
};

export function scanDecision({ wave = null, qrText = null } = {}) {
  if (wave?.ok && typeof wave.handle === 'string') {
    const card = resolveAudiusProfile({ handle: wave.handle });
    if (card.ok) return { ...card, source: 'wave-code', contract: WAVE_CODE_CONTRACT };
  }
  if (typeof qrText === 'string' && qrText) {
    const card = decodeCardPayload(qrText);
    return { ...card, source: 'qr', contract: card.ok ? 'wavid-card/1.0' : null };
  }
  return {
    ok: false,
    source: 'wave-code',
    code: wave?.code || 'not-found',
    reason: wave?.reason || 'No WavID wave code is in this frame. Fill the view with the artwork.',
    contract: WAVE_CODE_CONTRACT,
    ...EMPTY,
  };
}

export function frameSize(width, height, cap = 1200) {
  const long = Math.max(Number(width) || 0, Number(height) || 0);
  const scale = long > cap ? cap / long : 1;
  return {
    width: Math.max(1, Math.round((Number(width) || 1) * scale)),
    height: Math.max(1, Math.round((Number(height) || 1) * scale)),
  };
}
