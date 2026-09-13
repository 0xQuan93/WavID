# WaveWarz integration handoff

WavID Browser Studio translates a frozen, public artist observation into a
deterministic visual identity preview. The intended home is WaveWarz.info: the
site supplies its route, account context and eventual persistence; the studio
supplies the versioned mapping, renderer and inspection experience. A static
demo can run independently on GitHub Pages, entirely on each visitor's device.
There is no generation service to keep running on the artist's computer.

This implementation is a step toward the [WavID thesis](https://wavewarz.info/wavid).
The thesis describes a broader identity lineage and evidence system. Browser
generation does not implement that complete protocol.

## Reusable modules

| Module | Responsibility | Host responsibility |
| --- | --- | --- |
| `src/core/index.mjs` | Normalize observations, validate reconciled records, derive definitions, verify portable files | Supply observations and explicit checkpoint time; preserve original versions |
| `src/renderer/index.ts` | React/SVG artwork at an explicit frame | Transport, visibility, reduced motion, layout and error handling |
| `src/studio/WavIdStudio.jsx` | Embeddable studio, with collection, transport, inspector and export controls | Supply navigation, account context and any persistence |
| `src/main.jsx` | Standalone React mount | Replace with the host's route mounting |
| `public/fixtures/` | Four frozen examples and regression inputs | Present as historical observations; retain source attribution |

The core is browser JavaScript with no dependencies. The renderer uses React and
TypeScript/TSX; use a bundler that handles those files. This source handoff is not
an already-published npm library. Review [third-party notices](../THIRD_PARTY_NOTICES.md)
before incorporating the renderer into another distribution.

## Embed the complete studio

Copy `src/core/`, `src/renderer/`, `src/studio/` and `src/styles.css` together,
retaining their notices. The component stylesheet is scoped to `.wavid-studio`;
the standalone body's reset is separate in `src/standalone.css` and is not needed
by the host. Render the studio inside the host's client boundary.

```jsx
'use client'; // For hosts using React Server Components, such as Next.js.

import { WavIdStudio } from './wavid/studio/WavIdStudio';
import './wavid/styles.css';

export function WavIdPage({ rosterSnapshot }) {
  return <WavIdStudio initialRoster={rosterSnapshot} />;
}
```

| Prop | Contract |
| --- | --- |
| `initialRoster` | Initial immutable normalized snapshot with `artists`, `checkedAt`, `sources`, and `snapshotSha256`; omit to load frozen examples. Remount with a different React key to replace it externally. |
| `fixtureBaseUrl` | Base URL of the example `index.json` and its fixture files; default `./fixtures/` |
| `loadRoster` | Async function called for explicit roster refresh; accepts `{ signal }`, returns a normalized snapshot; defaults to the public loader |
| `onDefinition` | Receives the current browser definition for host observation; does not authorize a profile write |

The frozen collection form can instead provide `artists` and a `checkpoints`
record keyed by `artistKey`, with each value holding that artist's `checkedAt`,
`rosterSnapshotSha256` and `sources`. If using the default examples, copy
`public/fixtures/` to the host's static assets and set `fixtureBaseUrl` to its
actual route. An injected complete snapshot does not require those fixture files.
Use the host's own authenticated write action for future official saves; do not
automatically publish from `onDefinition`.

The injected loader must honor its abort signal and return trusted, normalized
data, not a raw API response. The studio disables import during pending loads and
preserves the current collection on refresh failure. Public refresh has a
30-second successful-request cooldown. Default public loads omit credentials;
the browser does not fetch remote media referenced by artist records.

## Embed artwork only

Copy the core and renderer directories together into the host application's source
tree, retaining notices. Render this component within the site's client boundary
when the host uses server components. The example intentionally supplies a fixed
frame; the caller can change it through transport controls.

```jsx
'use client';

import { useMemo } from 'react';
import { generateDefinition } from './wavid/core/index.mjs';
import { WavIdRenderer } from './wavid/renderer/index';

export function ArtistWavId({ artist, checkpoint, frame = 88 }) {
  const result = useMemo(() => {
    try {
      return { definition: generateDefinition(artist, checkpoint) };
    } catch (error) {
      return { error: error.message };
    }
  }, [artist, checkpoint]);

  if (result.error) return <p role="alert">{result.error}</p>;
  return (
    <figure>
      <WavIdRenderer
        props={result.definition.props}
        frame={frame}
        title={`${artist.displayName} — WavID preview`}
      />
      <figcaption>
        Public observation · {checkpoint.checkedAt} · Artist control unverified
      </figcaption>
    </figure>
  );
}
```

Keep `artist`, `checkpoint`, and generated props immutable. Replace objects when
their contents change. The renderer caches geometry by anatomy and organism
object identity; mutating those objects can invalidate the cache contract.
Validate frame values as finite numbers before passing them from external input.

The SVG has a 1080 × 1080 viewBox, instance-scoped IDs, an accessible title and
description. It performs no fetches and starts no timers. Frame units remain
30 fps with 240 frames in the material-v1 loop. Sampling fewer frames changes
preview smoothness, not identity or the underlying timeline. Begin paused, stop
work in hidden tabs, and respect reduced-motion preferences. Measure actual
phone performance before promising a playback frame rate.

## Public observations and coverage

The standalone loader explicitly requests these two read-only inputs:

```text
https://wavewarz.info/api/public/leaderboards/artists?limit=500
https://wavewarz.info/api/public/leaderboards/songs?sort=volume&limit=500
```

The [official API documentation](https://wavewarz.info/api-docs) describes open
CORS, no API key, Main Event artist totals, Quick Battle song totals, and a maximum
of 500 rows per leaderboard. These endpoints do not establish complete roster or
career coverage. The studio's counts describe the rows it loaded. A missing artist
or song is not evidence of an empty history.

Use `normalizeRoster(artistsPayload, songsPayload, retrievedAt)` to obtain
`artists`, `counts`, `sources`, `checkedAt`, and `snapshotSha256`. For a selected
eligible artist, create the checkpoint as follows:

```js
const checkpoint = {
  checkedAt: snapshot.checkedAt,
  rosterSnapshotSha256: snapshot.snapshotSha256,
  sources: snapshot.sources,
  revision: 1,
  freshness: 'browser-observation',
};
```

Preserve retrieval timestamps and the API's separate update timestamps. Fetch
without account credentials for the public path. Handle failure as a failed
refresh while retaining the current selection. If the host adds automatic
refresh, honor the API's documented 30–60 second cache interval. Freeze the
selected checkpoint before rendering or exporting; a later refresh is new input.

Song identity is grouped by Audius handle. Main Event metadata is joined by
public-name matching, recorded as `matched-by-public-name`; that join can be
ambiguous and does not authenticate the associated wallet or social handle.
Unresolved artists remain visible but cannot generate. Eligibility requires a
stable matching Audius identity, one to 500 distinct reconciled tracks, valid
nonnegative values and matching song/aggregate totals.

For full-roster integration, WaveWarz should provide a stable artist identifier
and a complete, paginated artist checkpoint contract with coverage metadata.
The existing paginated battle feed is not a drop-in replacement for normalized
song totals. Any new aggregation needs explicit reconciliation rules and tests;
do not silently mix it into historic material-v1 checkpoints.

## Integrity and artist control

`createPortableExport(artist, checkpoint)` includes the source, generated
definition, and envelope, source and props SHA-256 commitments.
`parsePortableExport(payload)` validates the supported envelope and checkpoint
fields, checks hashes, regenerates the definition, and rejects disagreement.
Importing a document must not fetch URLs supplied inside it. Bound file size and
handle parser errors in the host UI as the standalone studio does.

`describeProvenance(definition, mode)` regenerates and checks the definition
before exposing hashes, source metadata, aggregate inputs and song-to-band
assignments. `compareCheckpoints(previousExport, nextExport)` validates two
portable files for the same artist and reports source/geometry changes and
observed song/count differences. It does not update a canonical current state.
An absent song in a later leaderboard observation may reflect coverage rather
than a catalog deletion. Material-v1 derives visual form from public battle
statistics; it is not an acoustic fingerprint of the recording.

These hashes detect corruption and bind supplied data to its derivation. A person
can create a self-consistent file containing invented observations. Successful
import therefore proves internal consistency, not that WaveWarz issued the file,
that its timestamps are independently verified, or that the importer controls the
artist. HTTPS source references are attribution, not platform signatures.

The browser definition is `unclaimed-preview`. Compatibility genome and metadata
objects retain historical private-production/private-review vocabulary from the
original mapper; those labels grant no production or publication authority.
Do not turn them into a verified-profile badge. A PNG does not claim an artist,
register a profile, establish recording ownership, or mint anything.

An official save flow belongs in WaveWarz's authenticated application. It must
resolve the signed-in controller to a persistent artist root through the site's
own verified mapping, validate authoritative observations, store immutable
checkpoints, and return its own receipt. Controller recovery, signatures,
revocation, and canonical-current selection remain host/protocol work. No such
write endpoint or account flow is supplied by this studio.

## Versioning and reproducibility

| Contract | Current identifier |
| --- | --- |
| Visual mapping | `wavewarz-roster-to-material-v1/1.0.0` |
| Browser definition | `wavid-browser-definition/1.0.0` |
| Portable envelope | `wavid-browser-export/1.0` |
| Genome | `wavid-artist-genome/1.0.0` |
| Anatomy inspection encoding | `artistos-wavid-anatomy-encoding/1.0` |

The studio release number is separate from the mapping version. Interface polish
must not rewrite seed strings, canonical ordering, formulas or prior checkpoint
bytes. Always pass a frozen `checkedAt`; omitting it creates a current timestamp
and consequently a different source commitment. Archive the original portable
file and retain the matching core/renderer release for reproduction.

The portable definition remains independent of any rendered image. The identity
kit adds a PNG and a separate `wavid-browser-artifact/1.0` receipt, binding the
PNG's byte digest, dimensions and frame to the source, props, material and
portable-envelope hashes. It records `wavid-browser-svg` renderer version
`0.2.0`. The receipt is unsigned: its digest supports later comparison, not an
artist or platform authenticity claim. The studio creates a standard ZIP using
store mode, with no compression dependency.

For a production archive, also record the source commit and browser/render
environment alongside the portable file and receipt. Those are host archive
metadata, not extra fields accepted by the strict portable parser. A standalone
PNG cannot carry all the identity kit's contextual evidence by itself.

Tests preserve original props, material/genome hashes and complete geometric
paths for four frozen artists. Full trace digests are retained for the reference
runtime; cross-runtime comparisons round only four scalar style fields to 12
decimal places, never paths or identity commitments. Node 22 and Node 26 differ
in some style values by at most 2.22e-16; each matched the original engine exactly
within that runtime. See the renderer README for the measured boundary.
Geometric agreement is distinct from
pixel parity: the browser uses SVG approximations of the original film and
background layers, and browser filter compositing varies. Do not describe a
matching material hash as proof that two PNGs are byte-identical. Current
downloads are browser stills at 1080 or 2160 square; no production MP4 export
worker is included.

## Deployment boundary

`npm ci --ignore-scripts`, `npm test`, and `npm run build` produce a static `dist/`
site. Vite uses relative asset URLs for a project path such as `/WavID/`; validate
that actual path in the release smoke test. Publish only the generated site and
required notices, never development caches, browser profiles or local exports.
For WaveWarz.info, prefer direct component integration so navigation and any
future artist account flow remain part of the existing site.
