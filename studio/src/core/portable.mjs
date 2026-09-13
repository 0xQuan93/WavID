import { generateDefinition } from './generation.mjs';
import { canonicalSha256 } from './production-definition.mjs';
import { checkKeys, validateCheckpoint } from './validation.mjs';

const SCHEMA = 'wavid-browser-export/1.0';
const SHA256 = /^[0-9A-F]{64}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };

// Hashes detect corruption and bind the supplied observation. They are not signatures.
export function createPortableExport(artist, checkpoint) {
  const frozenArtist = structuredClone(artist);
  const frozenCheckpoint = validateCheckpoint(checkpoint);
  const definition = generateDefinition(frozenArtist, frozenCheckpoint);
  const payload = {
    schema: SCHEMA,
    artist: frozenArtist,
    checkpoint: frozenCheckpoint,
    definitionSha256: canonicalSha256(definition.props),
    sourceSha256: canonicalSha256(definition.source),
    definition,
  };
  return { ...payload, envelopeSha256: canonicalSha256(payload) };
}

export function parsePortableExport(payload) {
  checkKeys(payload, ['schema', 'artist', 'checkpoint', 'definitionSha256', 'sourceSha256', 'definition', 'envelopeSha256'], 'Definition export');
  if (payload.schema !== SCHEMA || !record(payload.artist) || !record(payload.definition)) fail('Choose a definition exported by this studio');
  for (const name of ['definitionSha256', 'sourceSha256', 'envelopeSha256']) {
    if (typeof payload[name] !== 'string' || !SHA256.test(payload[name])) fail(`Missing or invalid ${name}`);
  }
  const { envelopeSha256, ...unsigned } = payload;
  if (canonicalSha256(unsigned) !== envelopeSha256) fail('The saved checkpoint failed its envelope integrity check');
  const checkpoint = validateCheckpoint(payload.checkpoint);
  const artist = structuredClone(payload.artist);
  const definition = generateDefinition(artist, checkpoint);
  if (canonicalSha256(definition.props) !== payload.definitionSha256) fail('The definition does not match its recorded fingerprint');
  if (canonicalSha256(definition.source) !== payload.sourceSha256) fail('The source does not match its recorded fingerprint');
  if (canonicalSha256(definition) !== canonicalSha256(payload.definition)) fail('The saved definition does not reproduce from its checkpoint');
  return { artist, checkpoint, definition };
}
