import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { artistKeyFromMusicLink } from '../src/battle/observe.mjs';
import { normalizeRoster } from '../src/core/index.mjs';
import { cardFaceForArtist, cardFaceLayout, cardKitReadme } from '../src/card/face.mjs';
import {
  CARD_CONTRACT,
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

const fixtureArtist = async (file) => JSON.parse(await readFile(new URL(`../public/fixtures/${file}`, import.meta.url), 'utf8')).source.artist;

function boxesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test('card layout keeps the artwork, title, and QR inside the face without overlap', () => {
  const layout = cardFaceLayout();
  assert.equal(layout.contract, CARD_CONTRACT);
  assert.equal(layout.width, 1080);
  assert.equal(layout.height, 1680);
  assert.equal(layout.regions.qr.width, layout.regions.qr.height);
  assert.equal(layout.regions.qr.x, (layout.width - layout.regions.qr.width) / 2);
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

test('a fixture card QR decodes back to the card URL', async () => {
  const artist = await fixtureArtist('bettercallzaal.json');
  const face = cardFaceForArtist(artist, { publicBaseUrl: 'https://wavewarz.info' });
  const matrix = encodeQrMatrix(face.payload, { errorCorrectionLevel: face.errorCorrectionLevel });
  const image = qrMatrixToImageData(matrix, { modulePx: 8, quiet: 4 });
  assert.equal(decodeQrImageData(image.data, image.width, image.height), face.payload);
  const hashed = encodeCardUrl({ handle: artist.identity.audiusHandle, publicBaseUrl: 'http://127.0.0.1:18990', studioHash: true });
  const local = qrMatrixToImageData(encodeQrMatrix(hashed), { modulePx: 6, quiet: 4 });
  assert.equal(decodeQrImageData(local.data, local.width, local.height), hashed);
  const readme = cardKitReadme(face);
  assert.match(readme, new RegExp(face.payload.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(readme, /https:\/\/audius\.co\/bettercallzaal/);
  assert.match(readme, /does not write NFC/);
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
