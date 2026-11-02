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
| `src/battle/` | Delayed live-battle observation and dual material-v1 preview | Keep the poll in the browser. Do not treat it as a checkpoint source |
| `src/card/` | Card URL contract, QR payload, scan page, and printable card face | Mount `/wavid/scan` and `/wavid/card/:handle`. Supply the public origin encoded on printed cards |
| `src/main.jsx` | Standalone React mount, including hash routes for scan and card | Replace with the host's route mounting |
| `public/fixtures/` | Four frozen examples and regression inputs | Present as historical observations; retain source attribution |

The core is browser JavaScript with no dependencies. The renderer uses React and
TypeScript/TSX; use a bundler that handles those files. The card module also
depends on `qrcode` and `jsQR`. This source handoff is not
an already-published npm library. Review [third-party notices](../THIRD_PARTY_NOTICES.md)
before incorporating the renderer or the card scanner into another distribution.

## Embed the complete studio

Copy `src/core/`, `src/renderer/`, `src/studio/`, `src/battle/`, `src/card/` and `src/styles.css`
together,
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
| `cardPublicBaseUrl` | Origin encoded in printed card QR codes. Default `https://wavewarz.info`. Production links are `{origin}/wavid/card/{handle}` |
| `onOpenScan` | Called when the visitor chooses the in-studio scanner. Route this to the host's `/wavid/scan` page |

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

## Live battle panel

`src/battle/` polls `GET /api/public/battles?live=true` from the visitor's
browser while the tab is visible. The gap between checks is at least 30
seconds. A hung check is abandoned after 20 seconds. Requests omit
credentials. There is no websocket, no added backend, and no chain RPC. A
failed check keeps the last successful sample. Every
sample carries an explicit `checkedAt`.

The panel is a delayed observation. Its label is `observed every ~30s · delayed`.
The countdown is counted from the last sample's `endsAt`. When the response
includes a row with `live: true`, that one battle is shown. An empty `battles`
array is a quiet empty state. A successful HTTP response with no battle list
is a failed check and keeps the last sample. Rows with `live: false` are
ignored, including when they are the only row. Pool size is shown as a charts
factor only on Quick Battles.

Each side becomes `wavewarz:audius:<handle>` only from an `https://audius.co`
track link, including handles that contain periods. Off-platform `musicLink`
values (for example an X profile or a project site) are dropped, not rendered
as hrefs. Wallet-only or off-platform Main Event rows stay unresolved and do
not generate. Solana wallets keep their published base58 case. Extra feed
fields such as album art are ignored; the panel does not fetch remote media.
If that key matches an eligible artist in the roster snapshot already loaded,
the panel draws that artist's material-v1 form at frame 88. Pools, volumes,
and factors are status chrome. They are not inputs to
`wavewarz-roster-to-material-v1`.

`wavewarz-battle-overlay-v0` names a future interaction between the two forms.
This version does not change props. When `winnerDecided` and `winnerSide` are
both set, the panel offers a button that reuses the studio's roster refresh.
The snapshot on screen stays until that load finishes. If the winner resolved
to an Audius identity that can generate, the refresh holds a portable export
first so History can run `compareCheckpoints` for that same artist key. The
plan does not call compare by itself and does not rewrite an old snapshot.

## WavID card and phone scan

`src/card/` is the contract for a physical card. Version `wavid-card/1.0`.
A printed QR stores one URL. The default production form is:

```text
https://wavewarz.info/wavid/card/<audiusHandle>
```

`<audiusHandle>` is the handle already stored on the artist (`identity.audiusHandle`),
not a display name and not a wallet. The artist key remains
`wavewarz:audius:<handle>` with the handle lowercased using `en-US`, the same
rule as roster grouping and live-battle observation. Opening the URL shows a
card page: the material-v1 still when that artist is eligible in the loaded
observation, and a primary link to `https://audius.co/<handle>`. If no handle
is present, or the artist key does not match the handle, the page and the card
export stop. They do not invent an Audius URL.

The static studio cannot use that path directly. Its build uses relative asset
URLs, so deep paths would request assets from the wrong folder. The standalone
app therefore reads the same path from the hash:

```text
http://127.0.0.1:18990/#/wavid/card/<audiusHandle>
http://127.0.0.1:18990/#/wavid/scan
```

`parseCardRoute` accepts the path, the hash, or a full http(s) URL. The scanner
uses that parser and then stays inside the app. It does not navigate to whatever
origin was printed in an unrelated code. Credentials in a URL are rejected.

WaveWarz.info should mount the React pages on real paths and pass the public
origin into the studio. The scanner and the card page are client components.
Give them the same stylesheet (`src/styles.css`); card screens are scoped to
`.wavid-card`.

```jsx
'use client';

import { useRouter } from 'next/navigation';
import { CardScan } from './wavid/card/CardScan';
import { CardResolve } from './wavid/card/CardResolve';
import { WavIdStudio } from './wavid/studio/WavIdStudio';
import './wavid/styles.css';

export function ScanRoute() {
  const router = useRouter();
  return <CardScan onResolve={(card) => router.push(card.cardPath)} />;
}

export function CardRoute({ handle, artist }) {
  const router = useRouter();
  return (
    <CardResolve
      handle={handle}
      artist={artist}
      onScan={() => router.push('/wavid/scan')}
    />
  );
}

export function StudioRoute({ rosterSnapshot }) {
  const router = useRouter();
  return (
    <WavIdStudio
      initialRoster={rosterSnapshot}
      cardPublicBaseUrl="https://wavewarz.info"
      onOpenScan={() => router.push('/wavid/scan')}
    />
  );
}
```

`card.cardPath` is `/wavid/card/<encoded handle>`. `CardResolve` links to Audius
only after `resolveAudiusProfile` accepts the handle. Pass `artist` when the
host already has the public observation; otherwise the page still offers the
profile link and says that no WavID preview is loaded. The standalone demo
loads the frozen fixtures for the four example artists and does not call a new
API. Do not add an authenticated WaveWarz API for this flow.

`cardPublicBaseUrl` must be an origin: `https://wavewarz.info` in production.
`http` is accepted only for localhost and private-network hosts so a phone on
the same LAN can open the studio. The card dialog can switch the printed code
to the hash form (`{origin}/#/wavid/card/<handle>`) for that demo. Printed
WaveWarz cards should keep the path form.

From an eligible artist, **Print WavID card** downloads a zip with:

| File | Role |
| --- | --- |
| `card.png` | Portrait face: the still on screen, plus the QR |
| `card-link.txt` | The exact URL encoded in the QR |
| `identity.json` | The existing portable material-v1 definition |
| `READ-ME.txt` | What the scan opens, and what the file does not prove |

The still is the frame already prepared in the studio, rasterized with the
existing PNG path. The zip is the same store-format writer as the identity kit.
The card composite is not a `wavid-browser-artifact/1.0` receipt and does not
change material-v1 seeds, formulas, or frozen fixture hashes. `identity.json`
remains the reproducible checkpoint.

The scan page uses `BarcodeDetector` when the browser can read `qr_code`, and
`jsQR` on camera frames otherwise. Camera capture requires a secure context
(HTTPS or localhost). Permission, missing-camera, and unsupported-browser
states stay on the page, with a field to paste a card link. A phone's own
camera app can open a printed QR without the in-app scanner.

To try that on a LAN, set the card base URL to the computer's address, choose
the hash link, and start Vite on the network (`npx vite --host 0.0.0.0 --port 18990`).
The code then reads `http://192.168.x.x:18990/#/wavid/card/<handle>`. The
in-app scanner on that `http` LAN address will usually be blocked; the phone's
camera app can still open the page.

A later NFC tag can store this same URL as an NDEF URI record. Version 1 does
not write NFC.

QR modules are built with the `qrcode` package at error correction `Q`. Frames
are decoded with `jsQR` when the platform detector is unavailable. Both notices
are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

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
| Live battle observation | `wavewarz-live-battle-observation/0` |
| Battle overlay scaffold | `wavewarz-battle-overlay-v0` |
| WavID card payload | `wavid-card/1.0` |
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
downloads are browser stills at 1080 or 2160 square. The 2160 still scales
viewport-pixel stroke width and dash length so non-scaling strokes keep the 1080
reference weight. The same rasterizer can save one silent 8 second H.264 loop
at 10, 15, or 30 fps. 30 fps visits every material frame; 15 and 10 fps keep
the 8 seconds by sampling every second or third frame. There is no audio track.
BPM is the visual clock only. The file carries a `wavid-browser-loop/1.0`
provenance box and `productionMaster: false`. The production manifest still
describes an unrendered master (H.264, CRF 14, slow preset, BT.709, 2160,
audio none). Browser pixels and encoder bytes are not that master.

## Deployment boundary

`npm ci --ignore-scripts`, `npm test`, and `npm run build` produce a static `dist/`
site. Vite uses relative asset URLs for a project path such as `/WavID/`; validate
that actual path in the release smoke test. Publish only the generated site and
required notices, never development caches, browser profiles or local exports.
For WaveWarz.info, prefer direct component integration so navigation and any
future artist account flow remain part of the existing site.
