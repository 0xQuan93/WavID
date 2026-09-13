import { canonicalSha256, MAPPING_ID } from './production-definition.mjs';
import { generateDefinition } from './generation.mjs';
import { parsePortableExport } from './portable.mjs';

// This verifies the supplied bytes against the mapper. It does not establish
// who supplied those bytes, or whether an API or artist signed them.
export function describeProvenance(definition, mode = 'imported') {
  if (!definition || definition.schema !== 'wavid-browser-definition/1.0.0') throw new Error('A browser WavID definition is required');
  const source = definition.source;
  const definitionCopy = generateDefinition(source?.artist, {
    checkedAt: source?.rosterCheckedAt,
    rosterSnapshotSha256: source?.rosterSnapshotSha256,
    sources: source?.sources,
    revision: definition.birthRecord?.lineage?.revision,
    freshness: definition.birthRecord?.source?.freshness,
  });
  if (canonicalSha256(definitionCopy) !== canonicalSha256(definition)) throw new Error('Definition integrity failed: source, geometry or evidence does not reproduce');
  const { artist } = source;
  const { props, genome } = definitionCopy;
  const rankedSongs = [...artist.songs].sort((a, b) => b.totalVolumeSol - a.totalVolumeSol || a.musicLink.localeCompare(b.musicLink));
  const { fingerprint, ...material } = props.anatomy;
  const materialHash = canonicalSha256(material);
  if (materialHash !== fingerprint) throw new Error('Material fingerprint does not match its anatomy');
  return {
    status: 'integrity-checked',
    claimLevel: 'unsigned-public-observation',
    claimLabel: 'Reproducible observation · artist control unproven',
    signatureVerified: false,
    artistControlProven: false,
    mappingId: MAPPING_ID,
    artist: { artistKey: artist.artistKey, displayName: artist.displayName, audiusHandle: artist.identity.audiusHandle },
    hashes: {
      source: canonicalSha256(source),
      props: canonicalSha256(props),
      material: materialHash,
      genome: genome.genomeSha256,
      roster: source.rosterSnapshotSha256,
    },
    observation: {
      mode: ['live', 'frozen', 'imported'].includes(mode) ? mode : 'imported',
      checkedAt: source.rosterCheckedAt,
      revision: genome.checkpoint.number,
      sources: structuredClone(source.sources),
      coverage: 'capped-leaderboard-snapshot',
    },
    counts: {
      songs: artist.quickBattle.indexedSongs,
      battles: artist.quickBattle.battles,
      wins: artist.quickBattle.wins,
      losses: artist.quickBattle.losses,
      volumeSol: artist.quickBattle.totalVolumeSol,
    },
    features: { ...genome.checkpoint.features },
    bandAssignments: props.anatomy.bands.map((band, index) => {
      const song = rankedSongs[index % rankedSongs.length];
      return {
        index,
        songTitle: song.songTitle,
        musicLink: song.musicLink,
        battles: song.battles,
        volumeSol: song.totalVolumeSol,
        width: band.width,
        strength: band.strength,
        from: { ...band.from },
        to: { ...band.to },
      };
    }),
    limitations: [
      'Hashes check integrity and reproducibility; they are not artist or WaveWarz signatures.',
      'Observation dates are supplied metadata, not independently trusted timestamps.',
      'Capped leaderboards do not establish a complete artist catalog or battle history.',
      'A roster fingerprint references a snapshot; the full roster is not included or independently verified here.',
      'Material-v1 maps public battle statistics into visual form; it does not fingerprint the audio recording.',
      'Main Event records, trader slots and last-played dates do not shape material-v1.',
    ],
  };
}

const trackKey = song => {
  const url = new URL(song.musicLink);
  const [handle, track] = url.pathname.split('/').filter(Boolean);
  return `${url.origin}/${handle.toLowerCase()}/${track}`;
};

// Comparison is a local view of two immutable exports, not a ledger update or
// an assertion that either checkpoint is the artist's official latest state.
export function compareCheckpoints(previousExport, nextExport) {
  const previous = parsePortableExport(previousExport);
  const next = parsePortableExport(nextExport);
  if (previous.artist.artistKey !== next.artist.artistKey) throw new Error('Compare checkpoints for the same artist identity');
  const before = describeProvenance(previous.definition);
  const after = describeProvenance(next.definition);
  const differences = key => Object.keys(before[key]).map(field => ({
    field,
    previous: before[key][field],
    next: after[key][field],
    delta: Number((after[key][field] - before[key][field]).toFixed(6)),
  }));
  const previousTracks = new Set(previous.artist.songs.map(trackKey));
  const nextTracks = new Set(next.artist.songs.map(trackKey));
  const songs = (artist, other) => artist.songs.filter(song => !other.has(trackKey(song))).map(song => ({ songTitle: song.songTitle, musicLink: song.musicLink }));
  const elapsed = Date.parse(after.observation.checkedAt) - Date.parse(before.observation.checkedAt);
  return {
    artistKey: previous.artist.artistKey,
    previous: { checkedAt: before.observation.checkedAt, hashes: before.hashes },
    next: { checkedAt: after.observation.checkedAt, hashes: after.hashes },
    chronology: elapsed > 0 ? 'later' : elapsed < 0 ? 'earlier' : 'same-time',
    sourceChanged: before.hashes.source !== after.hashes.source,
    propsChanged: before.hashes.props !== after.hashes.props,
    materialChanged: before.hashes.material !== after.hashes.material,
    counts: differences('counts'),
    features: differences('features'),
    songsAdded: songs(next.artist, previousTracks),
    songsRemoved: songs(previous.artist, nextTracks),
    claimLevel: 'unsigned-public-observation',
    note: 'Differences describe these supplied observations. Missing songs may reflect leaderboard coverage, not deletion.',
  };
}
