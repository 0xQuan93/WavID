import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canonicalSha256, generateDefinition, createPortableExport, parsePortableExport,
  describeProvenance, compareCheckpoints, normalizeRoster,
} from '../src/core/index.mjs';

const fixture = JSON.parse(await readFile(new URL('../public/fixtures/oxquan.json', import.meta.url), 'utf8'));
const options = { checkedAt: fixture.source.rosterCheckedAt, sources: fixture.source.sources, rosterSnapshotSha256: fixture.source.rosterSnapshotSha256 };
const exported = () => createPortableExport(fixture.source.artist, options);
const rehash = payload => {
  const { envelopeSha256, ...rest } = payload;
  return { ...rest, envelopeSha256: canonicalSha256(rest) };
};

test('evidence binds source, props and material hashes without escalating observation into authority', () => {
  const saved = exported();
  for (const mode of ['live', 'frozen', 'imported', 'signed']) {
    const report = describeProvenance(saved.definition, mode);
    assert.equal(report.hashes.source, saved.sourceSha256);
    assert.equal(report.hashes.props, saved.definitionSha256);
    assert.equal(report.hashes.material, fixture.expected.materialSha256);
    assert.equal(report.observation.checkedAt, options.checkedAt);
    assert.deepEqual(report.observation.sources, options.sources);
    assert.equal(report.claimLevel, 'unsigned-public-observation');
    assert.equal(report.signatureVerified, false);
    assert.equal(report.artistControlProven, false);
    assert.match(report.limitations.join(' '), /does not fingerprint the audio/);
    assert.notEqual(report.observation.mode, 'signed');
  }
});

test('evidence cannot bless altered geometry, source, genome or claim boundaries', () => {
  for (const mutate of [
    d => { d.source.artist.displayName = 'Different'; },
    d => { d.props.anatomy.bands[0].width += 0.01; },
    d => { d.genome.checkpoint.materialSha256 = 'F'.repeat(64); },
    d => { d.birthRecord.boundaries.artistControlProven = true; },
    d => { d.sourceReference.signature = 'signed'; },
  ]) {
    const { definition } = exported();
    mutate(definition);
    assert.throws(() => describeProvenance(definition), /integrity/);
  }
});

test('band evidence follows material-v1 volume ordering and wrapping for short catalogs', () => {
  const artist = normalizeRoster({}, { songs: fixture.source.artist.songs.slice(-2) }, options.checkedAt).artists[0];
  const definition = generateDefinition(artist, options);
  const report = describeProvenance(definition);
  assert.equal(report.bandAssignments.length, 3);
  assert.deepEqual(report.bandAssignments.map(band => band.musicLink), [artist.songs[0].musicLink, artist.songs[1].musicLink, artist.songs[0].musicLink]);
  for (const band of report.bandAssignments) {
    const source = artist.songs.find(song => song.musicLink === band.musicLink);
    const round = value => Number(value.toFixed(6));
    assert.equal(band.width, round(0.032 + (1 - 2 ** (-source.battles / 4)) * 0.04));
    assert.equal(band.strength, round(0.28 + (1 - 2 ** (-source.totalVolumeSol / 0.5)) * 0.58));
  }
});

test('comparison preserves supplied envelopes and distinguishes evidence from visual change', () => {
  const before = exported();
  const next = createPortableExport(before.artist, { ...options, checkedAt: '2026-09-13T00:00:00Z' });
  const original = JSON.stringify([before, next]);
  const result = compareCheckpoints(before, next);
  assert.equal(result.chronology, 'later');
  assert.equal(result.sourceChanged, true);
  assert.equal(result.propsChanged, false);
  assert.equal(result.materialChanged, false);
  assert.ok(result.counts.every(field => field.delta === 0));
  assert.ok(result.features.every(field => field.delta === 0));
  assert.equal(JSON.stringify([before, next]), original);
  assert.equal(compareCheckpoints(next, before).chronology, 'earlier');
  assert.equal(compareCheckpoints(before, before).chronology, 'same-time');
});

test('comparison measures observed count and anatomy changes, while rejecting other identities and corrupt exports', () => {
  const before = exported();
  const artist = normalizeRoster({}, { songs: before.artist.songs.slice(1) }, options.checkedAt).artists[0];
  const next = createPortableExport(artist, options);
  const result = compareCheckpoints(before, next);
  assert.equal(result.counts.find(field => field.field === 'songs').delta, -1);
  assert.equal(result.songsRemoved[0].musicLink, before.artist.songs[0].musicLink);
  assert.deepEqual(result.songsAdded, []);
  assert.equal(result.materialChanged, true);
  assert.match(result.note, /coverage/);
  const outsider = structuredClone(artist);
  outsider.artistKey = 'wavewarz:audius:anotherartist';
  outsider.identity.audiusHandle = 'anotherartist';
  outsider.songs.forEach(song => { song.musicLink = song.musicLink.replace('/_0xQuan/', '/anotherartist/'); });
  assert.throws(() => compareCheckpoints(before, createPortableExport(outsider, options)), /same artist/);
  next.artist.displayName = 'Corrupt';
  assert.throws(() => compareCheckpoints(before, next), /integrity/);
});

test('invalid calendar dates, local timestamps and unsafe measures fail before generation or import', () => {
  for (const checkedAt of ['2026-02-30T00:00:00Z', '2026-02-29T00:00:00Z', '2026-09-13T24:00:00Z', '2026-09-13T00:00:00']) {
    assert.throws(() => generateDefinition(fixture.source.artist, { ...options, checkedAt }), /timestamp/);
    const payload = exported();
    payload.checkpoint.checkedAt = checkedAt;
    assert.throws(() => parsePortableExport(rehash(payload)), /timestamp/);
  }
  assert.doesNotThrow(() => generateDefinition(fixture.source.artist, { ...options, checkedAt: '2024-02-29T12:00:00.123456+00:00' }));
  for (const mutation of [
    a => { a.songs[0].totalVolumeSol = 1e300; a.quickBattle.totalVolumeSol = 1e300; },
    a => { a.songs[0].winRate = Infinity; },
    a => { a.songs[0].totalUniqueTraders = Number.MAX_SAFE_INTEGER + 1; },
    a => { a.quickBattle.summedSongLevelTraderSlots += 1; },
    a => { a.songs[0].lastPlayed = '2026-02-30T00:00:00Z'; },
    a => { a.songs[1].musicLink = a.songs[0].musicLink.replace('/_0xQuan/', '/_0xquan/'); },
  ]) {
    const artist = structuredClone(fixture.source.artist);
    mutation(artist);
    assert.throws(() => generateDefinition(artist, options));
  }
});

test('roster eligibility matches the generator boundary and reports limited coverage', () => {
  for (const edit of [
    song => { song.battles = Number.MAX_SAFE_INTEGER + 1; song.wins = song.battles; song.losses = 0; },
    song => { song.totalVolumeSol = 1e300; },
    song => { song.lastPlayed = '2026-02-30T00:00:00Z'; },
    song => { song.musicLink = 'https://audius.co/_0xQuan'; },
  ]) {
    const song = structuredClone(fixture.source.artist.songs[0]);
    edit(song);
    const roster = normalizeRoster({}, { songs: [song] }, options.checkedAt);
    assert.equal(roster.counts.birthEligible, 0);
    assert.equal(roster.coverage.completeRoster, false);
    assert.equal(roster.coverage.requestedLimit, 500);
  }
});
