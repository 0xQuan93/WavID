import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { artistKeyFromMusicLink } from '../src/battle/observe.mjs';
import { describeProvenance, generateDefinition, normalizeRoster } from '../src/core/index.mjs';
import { buildAnatomyCallouts, readCardIdentity, visibleCallouts } from '../src/card/callouts.mjs';
import { cardFaceForArtist, cardFaceLayout, cardKitReadme } from '../src/card/face.mjs';
import { resolveCardArtist, shouldFetchPublicRoster } from '../src/card/match.mjs';
import { cardWaveLayer } from '../src/card/render-card.mjs';
import { playbackFromResolve, tracksForArtist } from '../src/card/playback.mjs';
import {
  CARD_CONTRACT,
  CARD_QR_LEVEL,
  DEFAULT_PUBLIC_BASE_URL,
  decodeCardPayload,
  encodeCardUrl,
  handleFromArtist,
  handleFromMusicLink,
  parseCardRoute,
  resolveAudiusProfile,
  studioHashFor,
} from '../src/card/payload.mjs';
import { decodeQrImageData, encodeQrMatrix, qrMatrixToImageData } from '../src/card/qr.mjs';
import { frameSize, scanDecision } from '../src/card/scan-frame.mjs';
import { WAVE_CODE_CONTRACT, WAVE_HANDLE_LIMIT, decodeWaveImage, renderWaveLayer } from '../src/card/wave-code.mjs';

const fixtureArtist = async (file) => JSON.parse(await readFile(new URL(`../public/fixtures/${file}`, import.meta.url), 'utf8')).source.artist;

function boxesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test('card layout keeps the artwork, title, and caption inside the face without a QR square', () => {
  const layout = cardFaceLayout();
  assert.equal(layout.contract, CARD_CONTRACT);
  assert.equal(layout.waveCode, WAVE_CODE_CONTRACT);
  assert.equal(layout.width, 1080);
  assert.equal(layout.height, 1400);
  assert.equal(layout.regions.qr, undefined);
  assert.equal(layout.regions.art.width, layout.regions.art.height);
  const boxes = Object.values(layout.regions);
  for (const box of boxes) {
    assert.ok(box.width > 0 && box.height > 0);
    assert.ok(box.x >= 48 && box.y >= 0);
    assert.ok(box.x + box.width <= layout.width - 48);
    assert.ok(box.y + box.height <= layout.height);
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) assert.equal(boxesOverlap(boxes[i], boxes[j]), false);
  }
});

test('payload encode and decode preserve the Audius handle and artist key', async () => {
  const cases = [
    ['bettercallzaal.json', 'https://wavewarz.info/wavid/card/bettercallzaal', 'https://audius.co/bettercallzaal'],
    ['oxquan.json', 'https://wavewarz.info/wavid/card/_0xQuan', 'https://audius.co/_0xQuan'],
    ['godcloud.json', 'https://wavewarz.info/wavid/card/GodclouD', 'https://audius.co/GodclouD'],
    ['frameworkfortune.json', 'https://wavewarz.info/wavid/card/frameworkfortune', 'https://audius.co/frameworkfortune'],
  ];
  for (const [file, payload, audiusUrl] of cases) {
    const artist = await fixtureArtist(file);
    const before = JSON.stringify(artist);
    const face = cardFaceForArtist(artist);
    assert.equal(JSON.stringify(artist), before);
    assert.equal(face.ok, true);
    assert.equal(face.artistKey, artist.artistKey);
    assert.equal(face.handle, artist.identity.audiusHandle);
    assert.equal(face.payload, payload);
    assert.equal(face.audiusUrl, audiusUrl);
    assert.equal(face.artistKey, `wavewarz:audius:${artist.identity.audiusHandle.toLocaleLowerCase('en-US')}`);
    const decoded = decodeCardPayload(payload);
    assert.equal(decoded.ok, true);
    assert.equal(decoded.handle, artist.identity.audiusHandle);
    assert.equal(decoded.artistKey, artist.artistKey);
    assert.equal(decoded.audiusUrl, audiusUrl);
    assert.equal(decodeCardPayload(`${payload}/`).handle, artist.identity.audiusHandle);
    assert.equal(decodeCardPayload(`${payload}?src=nfc`).audiusUrl, audiusUrl);
    assert.equal(decodeCardPayload(payload.toUpperCase().replace(artist.identity.audiusHandle.toUpperCase(), artist.identity.audiusHandle)).ok, true);
  }
});

test('hash routes and local demo origins round-trip into the same profile', () => {
  const payload = encodeCardUrl({
    handle: 'Delo.Dark',
    publicBaseUrl: 'http://192.168.1.20:18990',
    studioHash: true,
  });
  assert.equal(payload, 'http://192.168.1.20:18990/#/wavid/card/Delo.Dark');
  const decoded = decodeCardPayload(payload);
  assert.equal(decoded.handle, 'Delo.Dark');
  assert.equal(decoded.artistKey, 'wavewarz:audius:delo.dark');
  assert.equal(decoded.audiusUrl, 'https://audius.co/Delo.Dark');
  assert.equal(decoded.cardPath, '/wavid/card/Delo.Dark');
  assert.equal(parseCardRoute('#/wavid/scan').name, 'scan');
  assert.equal(parseCardRoute('https://wavewarz.info/wavid/scan').name, 'scan');
  assert.equal(parseCardRoute('#/wavid/card/Delo.Dark').name, 'card');
  assert.equal(studioHashFor({ name: 'card', handle: 'Delo.Dark' }), '#/wavid/card/Delo.Dark');
  assert.equal(studioHashFor({ name: 'scan' }), '#/wavid/scan');
  assert.equal(parseCardRoute('#/').name, 'studio');
  assert.equal(encodeCardUrl({ handle: 'bettercallzaal' }), 'https://wavewarz.info/wavid/card/bettercallzaal');
  assert.equal(DEFAULT_PUBLIC_BASE_URL, 'https://wavewarz.info');
});

test('handle extraction follows the existing Audius music-link rules', () => {
  const links = [
    'https://audius.co/bettercallzaal/wavewarz-the-electric-vibez',
    'https://audius.co/Delo.Dark/dey-love-dark',
    'https://audius.co/_0xQuan/igothop',
    'https://Audius.co/GodclouD/track',
    'https://audius.co/frameworkfortune',
    'https://user:password@audius.co/0xQuan/track',
    'http://audius.co/bettercallzaal/track',
    'https://audius.co.evil.example/bettercallzaal',
    'https://wavewarz.info/bettercallzaal',
    'https://audius.co/',
    'https://audius.co/./track',
    'https://audius.co/../track',
    'https://example.com/track',
    '',
    null,
  ];
  for (const link of links) {
    const extracted = handleFromMusicLink(link);
    const observed = artistKeyFromMusicLink(link);
    if (!extracted) {
      assert.equal(observed, null, String(link));
      continue;
    }
    assert.equal(observed.handle, extracted);
    assert.equal(observed.artistKey, `wavewarz:audius:${extracted.toLocaleLowerCase('en-US')}`);
    assert.equal(observed.profileUrl, `https://audius.co/${encodeURIComponent(extracted)}`);
  }
});

test('resolve builds an Audius URL only when a stable handle is present', async () => {
  const artist = await fixtureArtist('bettercallzaal.json');
  const resolved = resolveAudiusProfile({ artist });
  assert.equal(resolved.audiusUrl, 'https://audius.co/bettercallzaal');
  assert.equal(handleFromArtist(artist), 'bettercallzaal');

  const missing = structuredClone(artist);
  missing.identity.audiusHandle = null;
  missing.artistKey = 'wavewarz:name:unknown';
  missing.eligibility = { canBirth: false, reason: 'no stable Audius song identity' };
  for (const result of [resolveAudiusProfile({ artist: missing }), cardFaceForArtist(missing), resolveAudiusProfile({ handle: '' }), resolveAudiusProfile({})]) {
    assert.equal(result.ok, false);
    assert.equal(result.audiusUrl, null);
    assert.equal(result.payload ?? null, null);
    assert.equal(JSON.stringify(result).includes('audius.co'), false);
    assert.equal(JSON.stringify(result).includes(missing.displayName), false);
  }

  const forged = structuredClone(artist);
  forged.artistKey = 'wavewarz:audius:someoneelse';
  const mismatch = resolveAudiusProfile({ artist: forged });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'key-mismatch');
  assert.equal(mismatch.audiusUrl, null);

  const namedOnly = { displayName: 'Not A Handle', artistKey: 'wavewarz:name:not-a-handle', identity: { audiusHandle: null }, eligibility: { canBirth: false, reason: 'no stable Audius song identity' } };
  const face = cardFaceForArtist(namedOnly);
  assert.equal(face.ok, false);
  assert.equal(face.payload, null);
  assert.equal(JSON.stringify(face).includes('Not'), false);

  const checkedAt = '2026-09-13T00:00:00.000Z';
  const roster = normalizeRoster({ artists: [{ name: 'Wallet Only', wallet: '9xMBJbs3xZ1CwpR75U7b4vpTD3ou3HbVzuHiLRE21Jgo' }] }, { songs: [] }, checkedAt);
  const walletFace = cardFaceForArtist(roster.artists[0]);
  assert.equal(walletFace.ok, false);
  assert.equal(walletFace.audiusUrl, null);
  assert.equal(JSON.stringify(walletFace).includes('audius.co'), false);
  assert.equal(JSON.stringify(walletFace).includes('9xMB'), false);

  for (const handle of ['.', '..', 'bad handle', 'a/b', 'has%20space', 'ü', 'a'.repeat(101)]) {
    const rejected = resolveAudiusProfile({ handle });
    assert.equal(rejected.ok, false, handle);
    assert.equal(rejected.audiusUrl, null);
  }
});

test('card payloads reject credentials, extra segments, and non-card codes', () => {
  const rejected = [
    'https://user:password@wavewarz.info/wavid/card/bettercallzaal',
    'https://wavewarz.info/wavid/card/bettercallzaal/extra',
    'https://wavewarz.info/wavid/card/',
    'https://evil.example/steal',
    'javascript:alert(1)',
    'https://audius.co/bettercallzaal',
    '',
  ];
  for (const payload of rejected) {
    const decoded = decodeCardPayload(payload);
    assert.equal(decoded.ok, false, payload);
    assert.equal(decoded.audiusUrl, null);
  }
  assert.equal(decodeCardPayload('https://user:password@wavewarz.info/wavid/card/bettercallzaal').code, 'credentials');
  assert.throws(() => encodeCardUrl({ handle: 'bettercallzaal', publicBaseUrl: 'http://wavewarz.info' }), /HTTPS/);
  assert.throws(() => encodeCardUrl({ handle: 'bettercallzaal', publicBaseUrl: 'https://wavewarz.info/wavid' }), /origin/);
  assert.throws(() => encodeCardUrl({ handle: '..' }), /stable Audius handle/);
  const badBase = cardFaceForArtist({ eligibility: { canBirth: true }, displayName: 'BetterCallZaal', artistKey: 'wavewarz:audius:bettercallzaal', identity: { audiusHandle: 'bettercallzaal' } }, { publicBaseUrl: 'http://example.com' });
  assert.equal(badBase.ok, false);
  assert.equal(badBase.payload, null);
  assert.equal(badBase.audiusUrl, null);
});

test('a legacy card QR still decodes, and it is not part of the card face', async () => {
  const artist = await fixtureArtist('bettercallzaal.json');
  const face = cardFaceForArtist(artist, { publicBaseUrl: 'https://wavewarz.info' });
  assert.equal(face.regions.qr, undefined);
  const matrix = encodeQrMatrix(face.payload, { errorCorrectionLevel: CARD_QR_LEVEL });
  const image = qrMatrixToImageData(matrix, { modulePx: 8, quiet: 4 });
  assert.equal(decodeQrImageData(image.data, image.width, image.height), face.payload);
  const hashed = encodeCardUrl({ handle: artist.identity.audiusHandle, publicBaseUrl: 'http://127.0.0.1:18990', studioHash: true });
  const local = qrMatrixToImageData(encodeQrMatrix(hashed), { modulePx: 6, quiet: 4 });
  assert.equal(decodeQrImageData(local.data, local.width, local.height), hashed);
  const readme = cardKitReadme(face);
  assert.match(readme, new RegExp(face.payload.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(readme, /https:\/\/audius\.co\/bettercallzaal/);
  assert.match(readme, /does not write NFC/);
  assert.match(readme, /artwork on card\.png is the scannable surface/);
  assert.doesNotMatch(readme, /QR code/);
  assert.doesNotMatch(readme, /audius\.co\/someoneelse/);
});

test('period handles from the roster path stay on the same card contract', () => {
  const song = {
    songTitle: 'Dey Love Dark',
    artistName: 'Dey Love Dark',
    musicLink: 'https://audius.co/Delo.Dark/dey-love-dark',
    genre: 'Unspecified',
    battles: 2,
    wins: 1,
    losses: 1,
    winRate: 50,
    totalVolumeSol: 1,
    totalUniqueTraders: 1,
    lastPlayed: '2026-09-13T00:00:00.000Z',
  };
  const roster = normalizeRoster({}, { songs: [song] }, '2026-09-13T00:00:00.000Z');
  const face = cardFaceForArtist(roster.artists[0], { publicBaseUrl: 'https://wavewarz.info' });
  assert.equal(face.ok, true);
  assert.equal(face.artistKey, 'wavewarz:audius:delo.dark');
  assert.equal(face.payload, 'https://wavewarz.info/wavid/card/Delo.Dark');
  assert.equal(face.audiusUrl, 'https://audius.co/Delo.Dark');
  assert.equal(decodeCardPayload(face.payload).artistKey, roster.artists[0].artistKey);
});

function paintBackdrop(layer, { noise = false } = {}) {
  const data = new Uint8ClampedArray(layer.data);
  const size = layer.width;
  const origin = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      if (data[offset + 3] !== 0) continue;
      const radius = Math.hypot(x - origin, y - origin) / size;
      if (noise && radius < 0.36) {
        const n = ((x * 17 + y * 29) ^ (x * y)) & 255;
        data[offset] = 30 + (n % 90);
        data[offset + 1] = 20 + (n % 40);
        data[offset + 2] = 16 + (n % 30);
      } else {
        data[offset] = 14;
        data[offset + 1] = 20;
        data[offset + 2] = 16;
      }
      data[offset + 3] = 255;
    }
  }
  return data;
}

function placeLayer(layer, { angle = 0, scale = 1, offsetX = 24, offsetY = -16 } = {}) {
  const size = layer.width;
  const source = paintBackdrop(layer, { noise: true });
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const bound = Math.ceil(size * scale * (Math.abs(cos) + Math.abs(sin)));
  const width = bound + 96;
  const height = bound + 96;
  const data = new Uint8ClampedArray(width * height * 4);
  const centerX = width / 2 + offsetX;
  const centerY = height / 2 + offsetY;
  const sourceCenter = (size - 1) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const sx = Math.round((dx * cos + dy * sin) / scale + sourceCenter);
      const sy = Math.round((-dx * sin + dy * cos) / scale + sourceCenter);
      const offset = (y * width + x) * 4;
      if (sx < 0 || sy < 0 || sx >= size || sy >= size) {
        data[offset] = 18;
        data[offset + 1] = 22;
        data[offset + 2] = 16;
        data[offset + 3] = 255;
        continue;
      }
      const from = (sy * size + sx) * 4;
      data[offset] = source[from];
      data[offset + 1] = source[from + 1];
      data[offset + 2] = source[from + 2];
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

function forceBits(layer, from, count, value) {
  const data = paintBackdrop(layer);
  const size = layer.width;
  const origin = (size - 1) / 2;
  const step = (Math.PI * 2) / 384;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - origin;
      const dy = y - origin;
      const radius = Math.hypot(dx, dy) / size;
      const inner = radius >= 0.405 && radius <= 0.445;
      const outer = radius >= 0.475 && radius <= 0.515;
      if (!inner && !outer) continue;
      let angle = Math.atan2(dy, dx) + Math.PI / 2;
      if (angle < 0) angle += Math.PI * 2;
      const index = Math.floor(angle / step) % 384;
      if ((index - from + 384) % 384 >= count) continue;
      const frac = angle / step - Math.floor(angle / step);
      if (Math.abs(frac - 0.5) > 0.3) continue;
      const light = (value === 0 && inner) || (value === 1 && outer);
      const offset = (y * size + x) * 4;
      if (light) {
        data[offset] = 214;
        data[offset + 1] = 255;
        data[offset + 2] = 176;
      } else {
        data[offset] = 10;
        data[offset + 1] = 16;
        data[offset + 2] = 13;
      }
      data[offset + 3] = 255;
    }
  }
  return data;
}

test('wave code round-trips fixture handles through the artwork raster', async () => {
  const files = ['bettercallzaal.json', 'oxquan.json', 'godcloud.json', 'frameworkfortune.json'];
  for (const file of files) {
    const artist = await fixtureArtist(file);
    const face = cardFaceForArtist(artist);
    assert.equal(face.waveCode, WAVE_CODE_CONTRACT);
    const layer = renderWaveLayer(520, face.handle);
    const center = ((260 * 520 + 260) * 4) + 3;
    assert.equal(layer.data[center], 0);
    const decoded = decodeWaveImage(paintBackdrop(layer, { noise: true }), layer.width, layer.height);
    assert.equal(decoded.ok, true, file);
    assert.equal(decoded.handle, face.handle);
    const decision = scanDecision({ wave: decoded, qrText: 'https://evil.example/steal' });
    assert.equal(decision.source, 'wave-code');
    assert.equal(decision.handle, face.handle);
    assert.equal(decision.audiusUrl, face.audiusUrl);
    assert.equal(decision.cardPath, face.cardPath);
    assert.equal(decision.artistKey, face.artistKey);
  }
});

test('wave code survives rotation, scale, offset, and a repairable sector', async () => {
  const artist = await fixtureArtist('bettercallzaal.json');
  const handle = artist.identity.audiusHandle;
  const layer = renderWaveLayer(500, handle);
  const placed = placeLayer(layer, { angle: 17 * Math.PI / 180, scale: 0.72, offsetX: 36, offsetY: -22 });
  const decoded = decodeWaveImage(placed.data, placed.width, placed.height);
  assert.equal(decoded.handle, handle);
  const repaired = decodeWaveImage(forceBits(layer, 12, 40, 1), layer.width, layer.height);
  assert.equal(repaired.handle, handle);
  const ruined = decodeWaveImage(forceBits(layer, 4, 120, 1), layer.width, layer.height);
  assert.equal(ruined.ok, false);
  assert.equal(ruined.handle, null);
  assert.equal(ruined.audiusUrl, undefined);
  const blank = decodeWaveImage(new Uint8ClampedArray(200 * 200 * 4), 200, 200);
  assert.equal(blank.ok, false);
  assert.equal(scanDecision({ wave: blank, qrText: 'https://evil.example/steal' }).ok, false);
  assert.equal(scanDecision({ wave: blank, qrText: 'https://evil.example/steal' }).audiusUrl, null);
  const legacy = scanDecision({ wave: blank, qrText: 'https://wavewarz.info/wavid/card/bettercallzaal' });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.source, 'qr');
  assert.equal(legacy.handle, 'bettercallzaal');
  assert.equal(frameSize(2400, 1200, 1200).width, 1200);
});

test('a portrait card composite decodes from the whole image and has no second code square', () => {
  const art = 468;
  const layer = renderWaveLayer(art, 'bettercallzaal');
  const width = 540;
  const height = 700;
  const originX = 36;
  const originY = 60;
  const image = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < image.length; i += 4) {
    image[i] = 11;
    image[i + 1] = 17;
    image[i + 2] = 14;
    image[i + 3] = 255;
  }
  for (let y = 0; y < art; y += 1) {
    for (let x = 0; x < art; x += 1) {
      const from = (y * art + x) * 4;
      const offset = ((y + originY) * width + (x + originX)) * 4;
      if (layer.data[from + 3] === 0) {
        const n = ((x * 13 + y * 7) ^ (x * y)) & 255;
        image[offset] = 24 + (n % 70);
        image[offset + 1] = 18 + (n % 36);
        image[offset + 2] = 14 + (n % 24);
      } else {
        image[offset] = layer.data[from];
        image[offset + 1] = layer.data[from + 1];
        image[offset + 2] = layer.data[from + 2];
      }
      image[offset + 3] = 255;
    }
  }
  const decoded = decodeWaveImage(image, width, height);
  assert.equal(decoded.handle, 'bettercallzaal');
  const decision = scanDecision({ wave: decoded });
  assert.equal(decision.cardPath, '/wavid/card/bettercallzaal');
  assert.equal(decision.audiusUrl, 'https://audius.co/bettercallzaal');
});

test('a handle too long for the ring is refused without an Audius URL', async () => {
  const artist = await fixtureArtist('bettercallzaal.json');
  const handle = 'a'.repeat(WAVE_HANDLE_LIMIT + 1);
  artist.identity.audiusHandle = handle;
  artist.artistKey = `wavewarz:audius:${handle}`;
  const face = cardFaceForArtist(artist);
  assert.equal(face.ok, false);
  assert.equal(face.code, 'wave-capacity');
  assert.equal(face.payload, null);
  assert.equal(face.audiusUrl, null);
  assert.equal(JSON.stringify(face).includes('audius.co'), false);
  assert.throws(() => renderWaveLayer(240, handle), /cannot be woven/);
  assert.equal(resolveAudiusProfile({ handle: 'a'.repeat(40) }).ok, true);
});

function rosterForHandle(handle, displayName = handle) {
  const song = {
    songTitle: 'Signal',
    artistName: displayName,
    musicLink: `https://audius.co/${handle}/signal`,
    genre: 'Unspecified',
    battles: 2,
    wins: 1,
    losses: 1,
    winRate: 50,
    totalVolumeSol: 1,
    totalUniqueTraders: 1,
    lastPlayed: '2026-09-13T00:00:00.000Z',
  };
  return normalizeRoster({}, { songs: [song] }, '2026-09-13T00:00:00.000Z');
}

test('a supplied roster resolves artists outside the frozen fixtures', async () => {
  const ox = await fixtureArtist('oxquan.json');
  const storm = rosterForHandle('stormbourne', 'Stormbourne').artists[0];
  assert.equal(storm.artistKey, 'wavewarz:audius:stormbourne');
  assert.equal(storm.eligibility.canBirth, true);

  const fromRoster = resolveCardArtist({ handle: 'stormbourne', roster: { artists: [storm] } });
  assert.equal(fromRoster.source, 'roster');
  assert.equal(fromRoster.match, 'artist-key');
  assert.equal(fromRoster.canPreview, true);
  assert.equal(fromRoster.profile.audiusUrl, 'https://audius.co/stormbourne');
  assert.equal(fromRoster.profile.cardPath, '/wavid/card/stormbourne');
  assert.equal(shouldFetchPublicRoster({ roster: { artists: [storm] }, handle: 'stormbourne' }), false);

  const preferred = resolveCardArtist({ handle: 'stormbourne', artist: storm, roster: { artists: [ox] } });
  assert.equal(preferred.source, 'artist');
  assert.equal(preferred.artist.artistKey, storm.artistKey);
  assert.equal(shouldFetchPublicRoster({ artist: storm, handle: 'delo.dark' }), false);

  const fallback = resolveCardArtist({ handle: 'stormbourne', artist: ox, roster: { artists: [storm] } });
  assert.equal(fallback.source, 'roster');
  assert.equal(fallback.canPreview, true);

  const blockedArtist = structuredClone(storm);
  blockedArtist.eligibility = { canBirth: false, reason: 'Quick Battle record does not reconcile' };
  const blocked = resolveCardArtist({ handle: 'stormbourne', roster: { artists: [blockedArtist] } });
  assert.equal(blocked.canPreview, false);
  assert.equal(blocked.reason, 'Quick Battle record does not reconcile');
  assert.equal(blocked.profile.audiusUrl, 'https://audius.co/stormbourne');
  assert.equal(cardFaceForArtist(blockedArtist).ok, false);
  assert.equal(cardFaceForArtist(blockedArtist).payload, null);

  for (const handle of ['_0xquan', '_0xQuan']) {
    const direct = resolveCardArtist({ handle, roster: { artists: [ox] } });
    assert.equal(direct.match, 'artist-key', handle);
    assert.equal(direct.alias, false, handle);
    assert.equal(direct.canPreview, true, handle);
    assert.equal(direct.profile.handle, '_0xQuan');
    assert.equal(direct.profile.artistKey, 'wavewarz:audius:_0xquan');
    assert.equal(direct.profile.audiusUrl, 'https://audius.co/_0xQuan');
    assert.equal(shouldFetchPublicRoster({ frozenArtists: [ox], handle }), false, handle);
  }

  const alias = resolveCardArtist({ handle: 'oxquan', roster: { artists: [ox] } });
  assert.equal(alias.match, 'display-alias');
  assert.equal(alias.alias, true);
  assert.equal(alias.canPreview, true);
  assert.equal(alias.artist.artistKey, 'wavewarz:audius:_0xquan');
  assert.equal(alias.profile.handle, '_0xQuan');
  assert.equal(alias.profile.cardPath, '/wavid/card/_0xQuan');
  assert.equal(alias.profile.audiusUrl, 'https://audius.co/_0xQuan');
  assert.equal(alias.route.artistKey, 'wavewarz:audius:oxquan');
  assert.equal(shouldFetchPublicRoster({ frozenArtists: [ox], handle: 'oxquan' }), false);

  const named = structuredClone(ox);
  named.displayName = 'Other';
  named.identity = { ...ox.identity, audiusHandle: 'oxquan' };
  named.artistKey = 'wavewarz:audius:oxquan';
  const exact = resolveCardArtist({ handle: 'oxquan', roster: { artists: [ox, named] } });
  assert.equal(exact.match, 'artist-key');
  assert.equal(exact.artist.artistKey, 'wavewarz:audius:oxquan');
  assert.equal(exact.alias, false);

  const ambiguous = resolveCardArtist({
    handle: 'samename',
    roster: {
      artists: [
        rosterForHandle('alpha_one', 'Same Name').artists[0],
        rosterForHandle('beta_two', 'Same-Name').artists[0],
      ],
    },
  });
  assert.equal(ambiguous.canPreview, false);
  assert.equal(ambiguous.match, 'ambiguous');
  assert.equal(ambiguous.artist, null);
  assert.match(ambiguous.reason, /Audius handle/);

  assert.equal(shouldFetchPublicRoster({ frozenArtists: [ox], handle: 'stormbourne' }), true);
  assert.equal(shouldFetchPublicRoster({ handle: 'stormbourne' }), true);
  assert.equal(shouldFetchPublicRoster({ handle: 'bad handle' }), false);
});

test('wave code weaves arbitrary roster handles, not only frozen fixtures', () => {
  const handles = ['stormbourne', 'Delo.Dark', 'Hurric4n3Ike', 'a'.repeat(WAVE_HANDLE_LIMIT)];
  for (const handle of handles) {
    const artist = rosterForHandle(handle).artists[0];
    assert.equal(artist.eligibility.canBirth, true, handle);
    const decision = resolveCardArtist({ handle, roster: { artists: [artist] } });
    assert.equal(decision.canPreview, true, handle);
    const face = cardFaceForArtist(artist);
    assert.equal(face.ok, true, handle);
    assert.equal(face.waveCode, WAVE_CODE_CONTRACT);
    assert.equal(face.regions.qr, undefined);
    assert.equal(face.handle, handle);
    const layer = cardWaveLayer(face);
    assert.equal(layer.contract, WAVE_CODE_CONTRACT);
    assert.equal(layer.handle, handle);
    const decoded = decodeWaveImage(paintBackdrop(layer), layer.width, layer.height);
    assert.equal(decoded.ok, true, handle);
    assert.equal(decoded.handle, handle);
    const decisionFromArt = scanDecision({ wave: decoded, qrText: 'https://evil.example/steal' });
    assert.equal(decisionFromArt.source, 'wave-code');
    assert.equal(decisionFromArt.handle, handle);
    assert.equal(decisionFromArt.artistKey, artist.artistKey);
  }
  const face = cardFaceForArtist(rosterForHandle('stormbourne').artists[0]);
  assert.throws(() => cardWaveLayer({ ...face, regions: { ...face.regions, qr: { x: 1, y: 1, width: 8, height: 8 } } }), /QR square/);
});

test('card resolve keeps the material still as the focal plane and the HUD as glass', async () => {
  const jsx = await readFile(new URL('../src/card/CardResolve.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const scan = await readFile(new URL('../src/card/CardScan.jsx', import.meta.url), 'utf8');
  assert.match(jsx, /className="wavid-card card-focal" data-layout="id-focal"/);
  assert.match(jsx, /className="card-stage"/);
  assert.match(jsx, /className="card-hud"/);
  assert.match(jsx, /className="card-art"/);
  assert.match(jsx, /className="card-art-frame"/);
  assert.match(jsx, /card-glass/);
  assert.match(jsx, /WavIdRenderer/);
  assert.match(jsx, /Open Audius profile/);
  assert.match(jsx, /Public observation\. This page does not prove control of the artist/);
  assert.match(jsx, /className="card-handle"/);
  assert.match(jsx, /className="card-key"/);
  assert.match(jsx, /className="card-identity"/);
  assert.match(jsx, /className="card-stream card-glass"/);
  assert.match(jsx, /Host-supplied/);
  assert.match(jsx, /onPointerDown/);
  assert.match(jsx, /onPointerUp/);
  assert.match(jsx, /onFocus/);
  assert.match(jsx, /pointerType === 'touch'/);
  assert.match(jsx, /buildAnatomyCallouts/);
  assert.doesNotMatch(jsx, /111,535/);
  assert.doesNotMatch(jsx, /totalEarningsSol/);
  assert.match(jsx, /<CardPlayer /);
  assert.doesNotMatch(scan, /card-focal/);
  assert.match(scan, /className="wavid-card"/);

  const focalStart = css.indexOf('.wavid-card.card-focal {');
  assert.ok(focalStart > css.indexOf('.wavid-card .card-art {'), 'focal rules override the thumbnail box');
  const focal = css.slice(focalStart);
  const glass = focal.match(/--card-glass:\s*rgba\(\s*7\s*,\s*14\s*,\s*12\s*,\s*([0-9.]+)\s*\)/);
  assert.ok(glass, 'focal glass fill is declared');
  assert.ok(Number(glass[1]) > 0 && Number(glass[1]) <= 0.2, 'glass fill stays near-transparent');
  assert.match(focal, /--card-glass-line:\s*rgba\(188,\s*241,\s*207,\s*0\.42\)/);
  const artRule = focal.slice(focal.indexOf('.wavid-card.card-focal .card-art {'), focal.indexOf('.wavid-card.card-focal .card-art-frame'));
  assert.match(artRule, /overflow:\s*visible/);
  assert.match(artRule, /border:\s*0/);
  assert.match(artRule, /background:\s*transparent/);
  assert.doesNotMatch(artRule, /420px/);
  assert.doesNotMatch(artRule, /object-fit:\s*cover/);
  const frameRule = focal.slice(focal.indexOf('.wavid-card.card-focal .card-art-frame {'), focal.indexOf('.wavid-card.card-focal .card-art-frame svg'));
  assert.match(frameRule, /aspect-ratio:\s*1/);
  assert.match(frameRule, /overflow:\s*visible/);
  assert.match(focal, /object-fit:\s*contain/);
  assert.match(focal, /prefers-reduced-motion:\s*reduce/);
  assert.match(focal, /prefers-reduced-transparency:\s*reduce/);
  assert.match(css, /\.wavid-card \.viewfinder/);
});

test('anatomy callouts follow the song-to-band ledger and skip settlement inventions', async () => {
  const bundle = JSON.parse(await readFile(new URL('../public/fixtures/oxquan.json', import.meta.url), 'utf8'));
  const artist = bundle.source.artist;
  const before = JSON.stringify(artist);
  const definition = generateDefinition(artist, {
    checkedAt: bundle.source.rosterCheckedAt,
    rosterSnapshotSha256: bundle.source.rosterSnapshotSha256,
    sources: bundle.source.sources,
  });
  assert.equal(JSON.stringify(artist), before);
  const provenance = describeProvenance(definition, 'frozen');
  const callouts = buildAnatomyCallouts(definition);
  const bands = callouts.filter((entry) => entry.kind === 'band');
  assert.equal(bands.length, provenance.bandAssignments.length);
  assert.ok(bands.length > 0);
  const ranked = [...artist.songs].sort((a, b) => b.totalVolumeSol - a.totalVolumeSol || a.musicLink.localeCompare(b.musicLink));
  for (let index = 0; index < bands.length; index += 1) {
    assert.equal(bands[index].songTitle, provenance.bandAssignments[index].songTitle);
    assert.equal(bands[index].volumeSol, provenance.bandAssignments[index].volumeSol);
    assert.equal(bands[index].battles, provenance.bandAssignments[index].battles);
    assert.equal(bands[index].wins, ranked[index % ranked.length].wins);
    assert.equal(bands[index].losses, ranked[index % ranked.length].losses);
    assert.ok(bands[index].anchor.x >= 0 && bands[index].anchor.x <= 1080);
    assert.ok(bands[index].anchor.y >= 0 && bands[index].anchor.y <= 1080);
    assert.equal(JSON.stringify(bands[index]).includes('totalEarnings'), false);
  }
  const node = callouts.find((entry) => entry.kind === 'node');
  const cavity = callouts.find((entry) => entry.kind === 'cavity');
  assert.equal(node.battles, artist.quickBattle.battles);
  assert.equal(node.wins, artist.quickBattle.wins);
  assert.equal(node.losses, artist.quickBattle.losses);
  assert.equal(cavity.winRate, artist.quickBattle.winRate);
  assert.equal(cavity.songs, artist.quickBattle.indexedSongs);
  assert.equal(cavity.volumeSol, artist.quickBattle.totalVolumeSol);
  const revealed = visibleCallouts(callouts, 'form').map((entry) => entry.kind);
  assert.deepEqual(revealed, ['band', 'node', 'cavity']);
  assert.equal(visibleCallouts(callouts, 'band:1')[0].id, 'band:1');
  assert.equal(visibleCallouts(callouts, null).length, 0);
  const identity = readCardIdentity(artist);
  assert.equal(identity.x, null);
  assert.equal(identity.avatar.startsWith('https://'), true);
  assert.equal(identity.main, null);
  const god = JSON.parse(await readFile(new URL('../public/fixtures/godcloud.json', import.meta.url), 'utf8')).source.artist;
  const godIdentity = readCardIdentity(god);
  assert.equal(godIdentity.x.url, 'https://x.com/therealgodcloud');
  assert.equal(godIdentity.x.handle, 'therealgodcloud');
  assert.equal(godIdentity.main.wins, god.mainEvent.wins);
  assert.equal(godIdentity.main.losses, god.mainEvent.losses);
  assert.equal(Object.hasOwn(godIdentity.main, 'totalEarningsSol'), false);
  assert.equal(JSON.stringify(callouts).includes(String(god.mainEvent.totalEarningsSol)), false);
});

test('card playback lists only this artist’s Audius track permalinks', async () => {
  const artist = await fixtureArtist('bettercallzaal.json');
  const tracks = tracksForArtist(artist, artist.identity.audiusHandle);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].permalink, 'https://audius.co/bettercallzaal/wavewarz-the-electric-vibez');
  assert.equal(tracks[0].title, 'WaveWarZ, the electric vibez');
  const mixed = structuredClone(artist);
  mixed.songs.push(
    { songTitle: 'Elsewhere', musicLink: 'https://audius.co/someoneelse/track' },
    { songTitle: 'Profile only', musicLink: 'https://audius.co/bettercallzaal' },
    { songTitle: 'Insecure', musicLink: 'http://audius.co/bettercallzaal/track' },
    { songTitle: 'Repeat', musicLink: 'https://audius.co/bettercallzaal/wavewarz-the-electric-vibez' },
  );
  assert.deepEqual(tracksForArtist(mixed, 'bettercallzaal').map((track) => track.permalink), [
    'https://audius.co/bettercallzaal/wavewarz-the-electric-vibez',
  ]);
  const playback = playbackFromResolve(
    tracks[0].permalink,
    { data: { id: 'Q4VZBVw', title: 'WaveWarZ, the electric vibez', user: { handle: 'bettercallzaal' } } },
    'https://api.audius.co/v1/tracks/Q4VZBVw?app_name=wavid-browser-studio',
  );
  assert.equal(playback.streamUrl, 'https://api.audius.co/v1/tracks/Q4VZBVw/stream?app_name=wavid-browser-studio');
  assert.equal(playback.embedUrl, 'https://audius.co/embed/track/Q4VZBVw?flavor=compact');
  assert.equal(playbackFromResolve(tracks[0].permalink, { data: { id: 'Q4VZBVw', user: { handle: 'other' } } }, 'https://api.audius.co/v1/tracks/Q4VZBVw'), null);
  assert.equal(playbackFromResolve(tracks[0].permalink, {}, 'https://api.audius.co/v1/resolve'), null);
});
