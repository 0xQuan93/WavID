// Browser port of ArtistOS material-v1. Geometry and production hashes are unchanged.
import { sha256Hex } from './sha256.mjs';

export const PRODUCTION_SCHEMA = 'artistos-wavid-production-definition/1.0';
export const MAPPING_ID = 'wavewarz-roster-to-material-v1/1.0.0';
export const ANATOMY_ENCODING_SCHEMA = 'artistos-wavid-anatomy-encoding/1.0';
export const COMPOSITION = 'ArtistWavIdProduction';
export const FPS = 30;
export const FRAMES = 240;

const PALETTES = [
  ['living-aqua', '#76f3df', '#5e293e', '#e4fff3', '#000503'],
  ['oxide-amber', '#f2a74b', '#842f22', '#fff0bd', '#060200'],
  ['bruised-violet', '#a78cff', '#d43f81', '#f5eaff', '#030006'],
  ['viridian-archive', '#8bdd72', '#355e45', '#efffd8', '#000501'],
  ['cerulean-static', '#62b8df', '#274862', '#e0f8ff', '#000306'],
  ['rose-cathode', '#e97a9b', '#673149', '#ffe3ec', '#050103'],
  ['sodium-ghost', '#e5c25a', '#63532c', '#fff5c8', '#050400'],
  ['sulfur-bloom', '#c8e65a', '#566628', '#f7ffd2', '#030500'],
  ['ice-filament', '#a9d9de', '#42575d', '#f2ffff', '#010405'],
  ['bone-phosphor', '#d6cfad', '#5a5441', '#fffbe5', '#040402'],
  ['carmine-fault', '#e0525f', '#682430', '#ffdce0', '#050001'],
  ['ultraviolet-ash', '#8372d9', '#40345f', '#eee9ff', '#020105']
];
const FAMILIES = ['ovoid', 'bilobed', 'trilobed', 'mantled', 'compressed', 'fronded'];
const TAU = Math.PI * 2;

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
};
export const canonicalSha256 = (value) => sha256Hex(JSON.stringify(canonicalize(value)));
const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const round = (value, places = 6) => Number(value.toFixed(places));
const sat = (value, half) => 1 - 2 ** (-Math.max(0, Number(value) || 0) / half);
const unit = (seed, label) => Number.parseInt(sha256Hex(`${seed}\0${label}`).slice(0, 8), 16) / 0xffffffff;
const slug = (value) => String(value || 'artist').toLowerCase().replace(/^@/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'artist';

function assertSource(source, birthRecord) {
  if (!source?.artist?.eligibility?.canBirth) throw new Error('Birth source is not eligible');
  if (!source.artist.identity?.audiusHandle || !source.artist.artistKey) throw new Error('Stable Audius identity is required');
  if (!Array.isArray(source.artist.songs) || source.artist.songs.length === 0) throw new Error('At least one reconciled song is required');
  if (canonicalSha256(source) !== birthRecord.source.canonicalSha256) throw new Error('Birth source canonical SHA-256 drift');
  for (const [index, song] of source.artist.songs.entries()) {
    if (!song.musicLink || !Number.isInteger(song.battles) || song.battles !== song.wins + song.losses) throw new Error(`Song ${index} does not reconcile`);
    const url = new URL(song.musicLink);
    const handle = url.pathname.split('/').filter(Boolean)[0];
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'audius.co' || handle.toLowerCase() !== source.artist.identity.audiusHandle.toLowerCase()) {
      throw new Error(`Song ${index} is outside the stable Audius identity`);
    }
  }
}

function buildMaterial(artist) {
  const seed = `quantum-quil:wavid:artist:production:v1:${artist.artistKey}`;
  const quick = artist.quickBattle;
  const outcome = quick.battles ? quick.wins / quick.battles : 0.5;
  const activity = sat(quick.battles, 24);
  const catalog = sat(quick.indexedSongs, 8);
  const volume = sat(quick.totalVolumeSol, 2);
  const genreCounts = new Map();
  for (const song of artist.songs) genreCounts.set(song.genre || 'Unspecified', (genreCounts.get(song.genre || 'Unspecified') || 0) + 1);
  const genres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const family = FAMILIES[Math.floor(unit(seed, 'family') * FAMILIES.length)];
  const cavityCount = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(artist.songs.length) / 2)));
  const nodeCount = Math.min(3, Math.max(1, Math.ceil(activity * 3)));
  const bandCount = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(artist.songs.length))));
  const body = {
    aspect: round(0.84 + outcome * 0.32), family,
    harmonics: [2, 3, 4, 5].map((order, index) => ({ order, amplitude: round(0.012 + unit(seed, `harmonic:${index}:amplitude`) * 0.032), phase: round(unit(seed, `harmonic:${index}:phase`) * TAU) })),
    lobes: genres.slice(0, 3).map(([, count], index) => ({ amplitude: round(0.04 + 0.08 * Math.sqrt(count / genres[0][1])), angle: round((index / Math.min(3, genres.length)) * TAU + unit(seed, `lobe:${index}`) * 0.35), concentration: round(3.4 + unit(seed, `lobe:${index}:concentration`) * 4.4) })),
    rotation: round(-Math.PI + unit(seed, 'rotation') * TAU), scale: round(0.91 + catalog * 0.08)
  };
  const cavities = Array.from({ length: cavityCount }, (_, index) => {
    const angle = (index / cavityCount) * TAU + unit(seed, `cavity:${index}:angle`) * 0.5;
    const distance = cavityCount === 1 ? 0.12 : 0.25 + unit(seed, `cavity:${index}:distance`) * 0.12;
    return { bridgePorosity: round(0.08 + (1 - Math.abs(outcome - 0.5) * 2) * 0.24), center: { x: round(Math.cos(angle) * distance), y: round(Math.sin(angle) * distance) }, irregularity: round(0.04 + unit(seed, `cavity:${index}:irregularity`) * 0.12), phase3: round(unit(seed, `cavity:${index}:phase3`) * TAU), phase5: round(unit(seed, `cavity:${index}:phase5`) * TAU), polarity: index % 2 ? -1 : 1, radii: { x: round(0.09 + unit(seed, `cavity:${index}:rx`) * 0.07), y: round(0.08 + unit(seed, `cavity:${index}:ry`) * 0.07) }, rotation: round(unit(seed, `cavity:${index}:rotation`) * TAU), sourceStrength: round(0.42 + volume * 0.5) };
  });
  const nodes = Array.from({ length: nodeCount }, (_, index) => {
    const angle = ((index + 0.5) / nodeCount) * TAU + unit(seed, `node:${index}:angle`) * 0.4;
    const distance = 0.42 + unit(seed, `node:${index}:distance`) * 0.1;
    return { center: { x: round(Math.cos(angle) * distance), y: round(Math.sin(angle) * distance) }, polarity: index < Math.round(nodeCount * outcome) ? 1 : -1, radius: round(0.055 + activity * 0.07), strength: round(0.36 + activity * 0.48) };
  });
  const rankedSongs = [...artist.songs].sort((a, b) => b.totalVolumeSol - a.totalVolumeSol || a.musicLink.localeCompare(b.musicLink));
  const bands = Array.from({ length: bandCount }, (_, index) => {
    const song = rankedSongs[index % rankedSongs.length];
    return { from: { kind: 'cavity', index: index % cavities.length }, to: { kind: 'node', index: index % nodes.length }, strength: round(0.28 + sat(song.totalVolumeSol, 0.5) * 0.58), width: round(0.032 + sat(song.battles, 4) * 0.04), bend: round((unit(seed, `band:${song.musicLink}:${index}`) - 0.5) * 0.38) };
  });
  const unsigned = { version: 'material-v1', body, cavities, bands, nodes };
  return { material: { ...unsigned, fingerprint: canonicalSha256(unsigned) }, seed, genres, rankedSongs, features: { activity: round(activity), catalog: round(catalog), volume: round(volume), outcome: round(outcome) } };
}

const closeEnough = (left, right) => Math.abs(Number(left) - Number(right)) <= 0.000001;

function publicApiSource(source) {
  if (!source || typeof source !== 'object') return null;
  try {
    const uri = new URL(source.uri);
    if (uri.protocol !== 'https:' || uri.username || uri.password || uri.hostname.toLowerCase() !== 'wavewarz.info') return null;
    return {
      uri: uri.toString(),
      freshness: String(source.freshness || 'unknown'),
      retrievedAt: source.retrievedAt || null,
      apiUpdatedAt: source.apiUpdatedAt || null
    };
  } catch {
    return null;
  }
}

export function projectWavIdAnatomyEncoding({ anatomy, genome, props, source, sourceReference }) {
  if (!anatomy?.available || !anatomy.map || source?.schema !== 'artistos-wavid-birth-source/0.1.0') return null;
  if (genome?.schema !== 'wavid-artist-genome/1.0.0' || genome?.mapping?.id !== MAPPING_ID) return null;
  if (sourceReference?.schema !== 'wavid-source-reference/1.0.0') return null;
  if (source.artist?.artistKey !== genome.identity?.artistKey || source.artist?.artistKey !== sourceReference?.source?.artistKey) {
    // Older source references do not duplicate artistKey. In that case, the hash and genome checks below remain authoritative.
    if (sourceReference?.source?.artistKey) return null;
  }
  if (canonicalSha256(source) !== String(sourceReference?.source?.canonicalSha256 || '').toUpperCase()) return null;
  if (canonicalSha256(source) !== String(genome?.checkpoint?.sourceCanonicalSha256 || '').toUpperCase()) return null;
  if (props?.anatomy?.fingerprint !== genome?.checkpoint?.materialSha256) return null;

  const artist = source.artist;
  const quick = artist?.quickBattle;
  if (!quick || !Array.isArray(artist.songs) || artist.songs.length === 0) return null;
  if (quick.battles !== quick.wins + quick.losses) return null;
  const features = {
    activity: round(sat(quick.battles, 24)),
    catalog: round(sat(quick.indexedSongs, 8)),
    volume: round(sat(quick.totalVolumeSol, 2)),
    outcome: round(quick.battles ? quick.wins / quick.battles : 0.5)
  };
  if (!Object.entries(features).every(([name, value]) => closeEnough(value, genome.checkpoint?.features?.[name]))) return null;

  const genres = [...new Map(artist.songs.reduce((entries, song) => {
    const genre = song.genre || 'Unspecified';
    entries.set(genre, (entries.get(genre) || 0) + 1);
    return entries;
  }, new Map())).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const rankedSongs = [...artist.songs].sort((a, b) => b.totalVolumeSol - a.totalVolumeSol || a.musicLink.localeCompare(b.musicLink));
  const bandFeatures = anatomy.map.bands.map((feature, index) => {
    const song = rankedSongs[index % rankedSongs.length];
    return {
      ...feature,
      encoding: {
        sourceKind: 'wavewarz-quick-battle-song',
        source: {
          songTitle: song.songTitle,
          artistName: song.artistName,
          musicLink: song.musicLink,
          genre: song.genre || 'Unspecified',
          battles: song.battles,
          wins: song.wins,
          losses: song.losses,
          winRate: song.winRate,
          totalVolumeSol: song.totalVolumeSol,
          lastPlayed: song.lastPlayed || null
        },
        transforms: [
          { output: 'width', input: 'battles', rule: '0.032 + saturation(battles, 4) × 0.04', value: feature.width },
          { output: 'field strength', input: 'totalVolumeSol', rule: '0.28 + saturation(volume SOL, 0.5) × 0.58', value: feature.strength },
          { output: 'route + bend', input: 'artist identity seed + band identity', rule: 'deterministic hash-derived geometry', value: `${feature.from} → ${feature.to}` }
        ]
      }
    };
  });
  const lobeFeatures = anatomy.map.lobes.map((feature, index) => {
    const [genre = 'Unspecified', songs = 0] = genres[index] || [];
    return {
      ...feature,
      encoding: {
        sourceKind: 'wavewarz-catalog-genre',
        source: { genre, songs, dominantGenreSongs: genres[0]?.[1] || 0 },
        transforms: [
          { output: 'amplitude', input: 'genre song count / dominant genre count', rule: '0.04 + 0.08 × √share', value: feature.amplitude },
          { output: 'angle + concentration', input: 'genre order + artist identity seed', rule: 'ordered placement with deterministic seed variation', value: feature.concentration }
        ]
      }
    };
  });
  const cavityFeatures = anatomy.map.cavities.map((feature) => ({
    ...feature,
    encoding: {
      sourceKind: 'wavewarz-quick-battle-aggregate',
      source: { indexedSongs: quick.indexedSongs, wins: quick.wins, losses: quick.losses, totalVolumeSol: quick.totalVolumeSol },
      transforms: [
        { output: 'count', input: 'indexedSongs', rule: 'clamp(ceil(√songs ÷ 2), 1, 3)', value: anatomy.map.cavities.length },
        { output: 'source strength', input: 'totalVolumeSol', rule: '0.42 + saturation(volume SOL, 2) × 0.5', value: feature.strength },
        { output: 'bridge porosity', input: 'win/loss balance', rule: '0.08 + balance × 0.24', value: feature.bridgePorosity },
        { output: 'position + shape', input: 'artist identity seed', rule: 'deterministic hash-derived geometry', value: feature.label }
      ]
    }
  }));
  const nodeFeatures = anatomy.map.nodes.map((feature) => ({
    ...feature,
    encoding: {
      sourceKind: 'wavewarz-quick-battle-aggregate',
      source: { battles: quick.battles, wins: quick.wins, losses: quick.losses },
      transforms: [
        { output: 'count', input: 'battle activity', rule: 'clamp(ceil(saturation(battles, 24) × 3), 1, 3)', value: anatomy.map.nodes.length },
        { output: 'radius + field strength', input: 'battle activity', rule: 'bounded saturation of total battles', value: `${feature.radius} / ${feature.strength}` },
        { output: 'polarity distribution', input: 'win ratio', rule: 'positive nodes = round(node count × win ratio)', value: feature.polarity > 0 ? 'positive' : 'negative' },
        { output: 'position', input: 'artist identity seed', rule: 'deterministic hash-derived geometry', value: feature.label }
      ]
    }
  }));
  const apiSources = (sourceReference.apiSources || []).map(publicApiSource).filter(Boolean);
  const encoding = {
    schema: ANATOMY_ENCODING_SCHEMA,
    status: 'hash-bound-frozen-checkpoint',
    mappingId: MAPPING_ID,
    artist: {
      artistKey: artist.artistKey,
      displayName: artist.displayName,
      audiusHandle: artist.identity?.audiusHandle || null,
      claimStatus: artist.identity?.claimStatus || null
    },
    checkpoint: {
      number: genome.checkpoint.number,
      checkedAt: genome.checkpoint.checkedAt,
      quickBattle: { ...quick },
      mainEvent: artist.mainEvent || { status: 'unobserved', record: null },
      genres: genres.map(([genre, songs]) => ({ genre, songs })),
      normalized: features
    },
    provenance: {
      sourceCanonicalSha256: genome.checkpoint.sourceCanonicalSha256,
      rosterSnapshotSha256: genome.checkpoint.rosterSnapshotSha256,
      materialSha256: genome.checkpoint.materialSha256,
      canonicalPropsSha256: genome.checkpoint.canonicalPropsSha256,
      apiSources,
      signature: sourceReference.signature || null
    },
    systems: {
      body: {
        inputs: ['artist identity', 'wins', 'losses', 'indexed songs', 'genre distribution'],
        outputs: ['family', 'aspect', 'scale', 'harmonics', 'rotation', 'lobes'],
        values: { family: anatomy.family, aspect: props.anatomy.body.aspect, scale: props.anatomy.body.scale }
      },
      cavities: { inputs: ['indexed songs', 'wins', 'losses', 'total Quick Battle volume', 'artist identity'], outputs: ['count', 'porosity', 'source strength', 'position', 'shape'] },
      bands: { inputs: ['ranked songs', 'per-song battles', 'per-song Quick Battle volume', 'artist identity'], outputs: ['song assignment', 'width', 'field strength', 'route', 'bend'] },
      nodes: { inputs: ['total Quick Battles', 'wins', 'losses', 'artist identity'], outputs: ['count', 'radius', 'field strength', 'polarity', 'position'] },
      lobes: { inputs: ['genre song counts', 'artist identity'], outputs: ['genre assignment', 'amplitude', 'angle', 'concentration'] },
      motionAndOptics: {
        inputs: ['battle activity', 'catalog size', 'win/loss ratio', 'Quick Battle volume', 'artist identity'],
        outputs: ['filament density', 'membrane tension', 'memory', 'nervousness', 'recovery', 'signal faults', 'palette']
      }
    },
    unmapped: [
      'Main Event record is preserved separately and does not shape material-v1.',
      'Trader slots and last-played timestamps are provenance context, not anatomy inputs.',
      'No anatomy channel represents income, support, rarity, rank, price, ownership, health, awareness, or human worth.'
    ]
  };
  return {
    ...anatomy,
    encoding,
    map: {
      ...anatomy.map,
      cavities: cavityFeatures,
      bands: bandFeatures,
      nodes: nodeFeatures,
      lobes: lobeFeatures
    }
  };
}

export function buildWavIdProductionDefinition({ birthRecord, source }) {
  assertSource(source, birthRecord);
  const artist = source.artist;
  const revision = Number.isInteger(Number(birthRecord?.lineage?.revision)) && Number(birthRecord.lineage.revision) > 0
    ? Number(birthRecord.lineage.revision)
    : 1;
  const handle = slug(artist.identity.audiusHandle);
  const attemptMatch = String(birthRecord.id || '').match(/-attempt-(\d+)$/);
  const attemptSuffix = attemptMatch ? `-attempt-${attemptMatch[1]}` : '';
  const revisionSuffix = revision > 1 ? `-revision-${String(revision).padStart(4, '0')}` : '';
  const jobId = `${handle}-${birthRecord.source.canonicalSha256.slice(0, 12).toLowerCase()}${attemptSuffix}${revisionSuffix}-production-v1`;
  const jobRoot = `tools/oxquan-remotion/jobs/quantum-quil/wavids/artist/${jobId}`;
  const mediaBase = `${handle}-artist-wavid-${birthRecord.source.canonicalSha256.slice(0, 12).toLowerCase()}${revisionSuffix}-v1`;
  const paths = {
    jobRoot,
    props: `${jobRoot}/props/${mediaBase}.json`, genome: `${jobRoot}/genome.json`, manifest: `${jobRoot}/manifest.json`, sourceReference: `${jobRoot}/source-reference.json`, receipt: `${jobRoot}/render-receipt.json`,
    metadata: `assets/campaigns/music/quantum-quil/metadata/drafts/wavids/artist/${jobId}/${mediaBase}.json`,
    poster: `assets/campaigns/music/quantum-quil/artwork/drafts/wavids/artist/${jobId}/${mediaBase}.png`,
    video: `content/video/remotion/drafts/quantum-quil/wavids/artist/${jobId}/${mediaBase}.mp4`
  };
  const built = buildMaterial(artist);
  const palette = PALETTES[Math.floor(unit(built.seed, 'palette') * PALETTES.length)];
  const traits = { analogAmount: round(0.93 + built.features.volume * 0.05), asymmetry: round(0.45 + Math.abs(built.features.outcome - 0.5) * 0.8), filamentDensity: round(0.5 + built.features.catalog * 0.35), membraneTension: round(0.24 + built.features.activity * 0.48), memory: round(0.52 + built.features.catalog * 0.3), nervousness: round(0.2 + (1 - Math.abs(built.features.outcome - 0.5) * 2) * built.features.activity * 0.55) };
  const title = `WavID // ${artist.displayName} // ${revision === 1 ? 'Birth' : 'Revision'} ${String(revision).padStart(4, '0')}`;
  const props = { accent: palette[1], analogAmount: traits.analogAmount, audio: '', background: palette[4], bpm: 120, edition: revision, form: built.material.body.family === 'fronded' ? 'veil-orb' : 'pulse-orb', highlight: palette[3], loopBeats: 16, organism: { attractorCount: built.material.nodes.length, asymmetry: traits.asymmetry, filamentDensity: traits.filamentDensity, membraneTension: traits.membraneTension, memory: traits.memory, nervousness: traits.nervousness, recovery: round(0.42 + built.features.outcome * 0.36), respirationBeats: 8 }, secondary: palette[2], seed: built.seed, signal: { collapse: round(0.22 + (1 - built.features.outcome) * 0.5), dropout: round(0.18 + (1 - Math.abs(built.features.outcome - 0.5) * 2) * 0.45), hold: round(0.28 + built.features.outcome * 0.55), interruption: round(0.18 + built.features.activity * 0.5), retrace: round(0.35 + traits.memory * 0.5) }, temperament: built.material.body.family, title, utility: 'Private Artist WavID review birth; no publication, mint, payment, or utility enabled', anatomy: built.material };
  const propsSha256 = canonicalSha256(props);
  const genomePayload = { schema: 'wavid-artist-genome/1.0.0', status: 'private-production-birth', identity: { artistKey: artist.artistKey, displayName: artist.displayName, audiusHandle: artist.identity.audiusHandle, xHandle: artist.identity.xHandle, wallet: artist.identity.wallet, identitySeed: built.seed, claimStatus: artist.identity.claimStatus }, checkpoint: { number: revision, sourceCanonicalSha256: birthRecord.source.canonicalSha256, rosterSnapshotSha256: birthRecord.source.rosterSnapshotSha256, checkedAt: birthRecord.source.checkedAt, quickBattle: artist.quickBattle, mainEvent: artist.mainEvent, genres: built.genres.map(([genre, songs]) => ({ genre, songs })), features: built.features, materialSha256: built.material.fingerprint, canonicalPropsSha256: propsSha256 }, mapping: { id: MAPPING_ID, semantics: ['Quick Battle trading volume is activity, not income, support, rarity, rank, or value.', 'Wins and losses shape directional pressure, not health or human worth.', 'Stable identity fixes anatomy; new checkpoints never rewrite prior bytes.'] }, boundaries: birthRecord.boundaries };
  const genome = { ...genomePayload, genomeSha256: canonicalSha256(genomePayload) };
  const sourceReference = { schema: 'wavid-source-reference/1.0.0', status: 'hash-bound-api-observation', birthId: birthRecord.id, source: birthRecord.source, apiSources: source.sources, signature: 'none; official API observations are hash-bound but not cryptographically signed by WaveWarz' };
  const metadata = { schema: 'wavid-draft-metadata/1.0.0', name: title, description: `A wordless private Artist WavID translating ${artist.displayName}'s hash-bound WaveWarz Quick Battle checkpoint into the approved material-v1 organism system.`, image: '', animation_url: '', status: 'private-review', attributes: [{ trait_type: 'Artist', value: artist.displayName }, { trait_type: 'WavID Revision', value: revision }, { trait_type: 'Indexed Songs', value: artist.quickBattle.indexedSongs }, { trait_type: 'Quick Battles', value: artist.quickBattle.battles }, { trait_type: 'Wins', value: artist.quickBattle.wins }, { trait_type: 'Losses', value: artist.quickBattle.losses }, { trait_type: 'Palette', value: palette[0] }, { trait_type: 'Body Family', value: built.material.body.family }], properties: { artistKey: artist.artistKey, revision, predecessorBirthId: birthRecord.lineage?.predecessorBirthId || null, mapping: MAPPING_ID, sourceCanonicalSha256: birthRecord.source.canonicalSha256, canonicalPropsSha256: propsSha256, approval: { exactArtifact: false, inheritance: false }, publication: false, mint: false, utility: false } };
  const manifestPayload = { schema: PRODUCTION_SCHEMA, status: 'defined-private-production-birth', root: birthRecord.root, birthId: birthRecord.id, jobId, title, objectType: 'artist-wavid', publicProductName: 'Artist WavID', lineage: { revision, predecessorBirthId: birthRecord.lineage?.predecessorBirthId || null, changeReasons: birthRecord.lineage?.changeReasons || [], immutablePriorAssets: true }, sourceReference, mapping: { id: MAPPING_ID }, renderer: { composition: COMPOSITION, entry: 'src/wavid-production-entry.ts', engine: 'quantum-quil-generative-organism-material-v1' }, renderProfile: { width: 1080, height: 1080, scale: 2, outputWidth: 2160, outputHeight: 2160, fps: FPS, frames: FRAMES, seconds: FRAMES / FPS, posterFrame: 88, codec: 'h264', crf: 14, x264Preset: 'slow', pixelFormat: 'yuv420p', colorSpace: 'bt709', audio: 'none' }, files: { props: { path: paths.props, canonicalSha256: propsSha256 }, genome: { path: paths.genome, canonicalSha256: canonicalSha256(genome) }, sourceReference: { path: paths.sourceReference, canonicalSha256: canonicalSha256(sourceReference) }, metadata: { path: paths.metadata, canonicalSha256: canonicalSha256(metadata) }, poster: { path: paths.poster, status: 'unrendered' }, video: { path: paths.video, status: 'unrendered' }, renderReceipt: { path: paths.receipt, status: 'absent' } }, approval: { productionSystem: 'approved-2026-08-14', exactArtifact: false, canon: false, publication: false, mint: false, utility: false, inheritance: false } };
  const manifest = { ...manifestPayload, manifestSha256: canonicalSha256(manifestPayload) };
  return { jobId, paths, props, genome, sourceReference, metadata, manifest };
}
