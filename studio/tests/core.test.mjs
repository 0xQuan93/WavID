import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildWavIdProductionDefinition, canonicalSha256, generateDefinition, validateArtist, normalizeRoster, createPortableExport, parsePortableExport } from '../src/core/index.mjs';
import { sha256Hex } from '../src/core/sha256.mjs';

const readFixture = async file => JSON.parse(await readFile(new URL(`../public/fixtures/${file}`, import.meta.url), 'utf8'));
const index = await readFixture('index.json');
const oxquan = await readFixture('oxquan.json');

test('SHA-256 matches Node on UTF-8, block boundaries and long inputs', () => {
  for (const value of ['', 'abc', '𝙓𝙏𝙞𝙣𝙘𝙏 / OxQuan ♡', '\0seed\0label', ...[55, 56, 63, 64, 65, 1000, 1000000].map(n => 'a'.repeat(n))]) {
    assert.equal(sha256Hex(value), createHash('sha256').update(value).digest('hex').toUpperCase());
  }
});

for (const entry of index) {
  test(`production parity: ${entry.name}, frozen actual ArtistOS birth`, async () => {
    const { source, birthRecord, expected } = await readFixture(entry.file);
    assert.equal(canonicalSha256(source), birthRecord.source.canonicalSha256);
    const actual = buildWavIdProductionDefinition({ source, birthRecord });
    assert.deepEqual(actual.props, expected.props);
    assert.equal(actual.genome.checkpoint.canonicalPropsSha256, expected.canonicalPropsSha256);
    assert.equal(actual.props.anatomy.fingerprint, expected.materialSha256);
    assert.equal(actual.genome.genomeSha256, expected.genomeSha256);
    // Browser envelope uses new provenance; the visual mapping stays identical.
    const browser = generateDefinition(source.artist, { checkedAt: source.rosterCheckedAt });
    assert.deepEqual(browser.props, expected.props);
    assert.equal(browser.status, 'unclaimed-preview');
    assert.equal(browser.birthRecord.boundaries.artistControlProven, false);
  });
}

test('frozen source hash rejects drift before mapping', () => {
  const modified = structuredClone(oxquan);
  modified.source.artist.displayName += ' changed';
  assert.throws(() => buildWavIdProductionDefinition(modified), /SHA-256 drift/);
});

test('canonical hashes do not depend on object insertion order', () => {
  assert.equal(canonicalSha256({ b: 2, a: { y: 3, x: 1 } }), canonicalSha256({ a: { x: 1, y: 3 }, b: 2 }));
});

test('browser boundary rejects identity substitution, invalid statistics and duplicate tracks', () => {
  const alter = fn => { const artist = structuredClone(oxquan.source.artist); fn(artist); return artist; };
  for (const artist of [
    alter(a => { a.displayName = { unexpected: 'object' }; }),
    alter(a => { a.displayName = ''; }),
    alter(a => { a.identity.audiusHandle = { unexpected: 'object' }; }),
    alter(a => { a.eligibility.canBirth = false; }),
    alter(a => { a.artistKey = 'wavewarz:audius:someoneelse'; }),
    alter(a => { a.songs[0].musicLink = 'https://audius.co/someoneelse/track'; }),
    alter(a => { a.songs[0].musicLink = 'https://audius.co/0xQuan'; }),
    alter(a => { a.songs[0].musicLink = 'https://user:password@audius.co/0xQuan/track'; }),
    alter(a => { a.songs[0].wins = -1; }),
    alter(a => { a.songs[0].songTitle = { invalid: 'React child' }; }),
    alter(a => { a.songs[0].totalVolumeSol = NaN; }),
    alter(a => { a.quickBattle.battles += 1; }),
    alter(a => { a.quickBattle.totalVolumeSol += 1; }),
    alter(a => { a.songs.push(a.songs[0]); }),
  ]) assert.throws(() => validateArtist(artist));
});

test('roster normalization preserves original public identity and aggregate rules', () => {
  const source = oxquan.source;
  const roster = normalizeRoster({ artists: [] }, { songs: source.artist.songs }, source.rosterCheckedAt);
  assert.equal(roster.artists.length, 1);
  const [artist] = roster.artists;
  assert.equal(artist.artistKey, source.artist.artistKey);
  assert.deepEqual(artist.quickBattle, source.artist.quickBattle);
  assert.deepEqual(artist.songs, source.artist.songs);
  assert.equal(artist.eligibility.canBirth, true);
  assert.deepEqual(generateDefinition(artist, { checkedAt: source.rosterCheckedAt }).props, oxquan.expected.props);
});

test('audius handles that contain periods stay eligible and reproducible', () => {
  const song = structuredClone(oxquan.source.artist.songs[0]);
  song.musicLink = 'https://audius.co/Delo.Dark/dey-love-dark';
  song.artistName = 'Dey Love Dark';
  const checkedAt = '2026-09-13T00:00:00.000Z';
  const roster = normalizeRoster({}, { songs: [song] }, checkedAt);
  assert.equal(roster.counts.birthEligible, 1);
  const [artist] = roster.artists;
  assert.equal(artist.artistKey, 'wavewarz:audius:delo.dark');
  assert.equal(artist.identity.audiusHandle, 'Delo.Dark');
  const first = generateDefinition(artist, { checkedAt });
  assert.equal(first.props.seed, 'quantum-quil:wavid:artist:production:v1:wavewarz:audius:delo.dark');
  assert.deepEqual(generateDefinition(artist, { checkedAt }), first);
  const checkpoint = { checkedAt, sources: [] };
  assert.equal(parsePortableExport(JSON.parse(JSON.stringify(createPortableExport(artist, checkpoint)))).artist.artistKey, artist.artistKey);
  for (const handle of ['.', '..', 'bad handle', 'a/b', 'has%20space']) {
    const forged = structuredClone(artist);
    forged.identity.audiusHandle = handle;
    forged.artistKey = `wavewarz:audius:${handle.toLocaleLowerCase('en-US')}`;
    assert.throws(() => validateArtist(forged), /Audius identity/);
  }
});

test('unresolved identities and unreconciled songs never become eligible', () => {
  const song = oxquan.source.artist.songs[0];
  const unresolved = normalizeRoster({ artists: [{ name: 'Unknown' }] }, { songs: [{ ...song, musicLink: 'https://example.com/track' }] });
  assert.equal(unresolved.counts.birthEligible, 0);
  assert.equal(unresolved.counts.unresolvedSongs, 1);
  const invalid = normalizeRoster({}, { songs: [{ ...song, battles: song.battles + 1 }] });
  assert.equal(invalid.artists[0].eligibility.canBirth, false);
});

test('unresolved wallet keys preserve case-sensitive Solana addresses', () => {
  const checkedAt = '2026-09-13T00:00:00.000Z';
  const upper = '9xMBJbs3xZ1CwpR75U7b4vpTD3ou3HbVzuHiLRE21Jgo';
  const lower = upper.toLowerCase();
  const roster = normalizeRoster({
    artists: [
      { name: 'Case A', wallet: upper, battles: 1, wins: 1, losses: 0 },
      { name: 'Case B', wallet: lower, battles: 1, wins: 0, losses: 1 },
      { name: 'Foo Bar' },
    ],
  }, { songs: [] }, checkedAt);
  assert.equal(roster.counts.birthEligible, 0);
  assert.deepEqual(roster.artists.map((artist) => artist.artistKey).sort(), [
    `wavewarz:name:foo-bar`,
    `wavewarz:wallet:${lower}`,
    `wavewarz:wallet:${upper}`,
  ].sort());
  assert.equal(roster.artists.find((artist) => artist.displayName === 'Case A').identity.wallet, upper);
});

test('same checkpoint generates reproducible envelope without changing input', () => {
  const artist = structuredClone(oxquan.source.artist);
  const before = JSON.stringify(artist);
  const options = { checkedAt: '2026-09-13T00:00:00.000Z' };
  assert.deepEqual(generateDefinition(artist, options), generateDefinition(artist, options));
  assert.equal(JSON.stringify(artist), before);
});

const portable = () => createPortableExport(oxquan.source.artist, {
  checkedAt: oxquan.source.rosterCheckedAt,
  rosterSnapshotSha256: oxquan.source.rosterSnapshotSha256,
  sources: oxquan.source.sources,
});
const rehashEnvelope = payload => {
  const { envelopeSha256, ...unsigned } = payload;
  payload.envelopeSha256 = canonicalSha256(unsigned);
  return payload;
};

test('portable checkpoint JSON roundtrip reproduces source, props and complete definition', () => {
  const exported = portable();
  const parsed = parsePortableExport(JSON.parse(JSON.stringify(exported)));
  assert.deepEqual(parsed.artist, oxquan.source.artist);
  assert.deepEqual(parsed.definition.props, oxquan.expected.props);
  assert.equal(exported.sourceSha256, oxquan.birthRecord.source.canonicalSha256);
  assert.deepEqual(parsed.definition, exported.definition);
  assert.deepEqual(createPortableExport(parsed.artist, parsed.checkpoint), exported);
});

test('portable import rejects checkpoint artists override even with a recomputed envelope', () => {
  const payload = portable();
  payload.checkpoint.artists = 'corrupt';
  assert.throws(() => parsePortableExport(rehashEnvelope(payload)), /Checkpoint contains unsupported fields/);
});

test('portable integrity binds source-only changes that do not affect the visual fingerprint', () => {
  const payload = portable();
  payload.artist.songs[0].lastPlayed = '2026-09-13T00:00:00.000Z';
  assert.equal(canonicalSha256(generateDefinition(payload.artist, payload.checkpoint).props), payload.definitionSha256);
  assert.throws(() => parsePortableExport(payload), /envelope integrity/);
  assert.throws(() => parsePortableExport(rehashEnvelope(payload)), /source does not match/);
});

test('portable import rejects altered nested definitions and malformed provenance', () => {
  const editedDefinition = portable();
  editedDefinition.definition.genome.identity.claimStatus = 'verified';
  assert.throws(() => parsePortableExport(rehashEnvelope(editedDefinition)), /does not reproduce/);
  for (const edit of [
    p => { p.checkpoint.checkedAt = {}; },
    p => { p.checkpoint.checkedAt = 'not a date'; },
    p => { p.checkpoint.sources = 'not an array'; },
    p => { p.checkpoint.sources = Array(9).fill(p.checkpoint.sources[0]); },
    p => { p.checkpoint.sources[0].uri = 'https://wavewarz.info.evil.example/api/public/test'; },
    p => { p.checkpoint.sources[0].uri = 'https://password@wavewarz.info/api/public/test'; },
    p => { p.checkpoint.rosterSnapshotSha256 = {}; },
    p => { p.checkpoint.revision = -1; },
  ]) {
    const payload = portable(); edit(payload);
    assert.throws(() => parsePortableExport(rehashEnvelope(payload)));
  }
});
