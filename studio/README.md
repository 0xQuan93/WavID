# WavID Browser Studio 0.2

History leaves form. A browser instrument for turning an artist's recorded
WaveWarz history into an inspectable, reproducible visual identity.

Select an artist, explore the form, compare checkpoints, and take the artwork
home with its evidence. Everything is generated on the visitor's device; there
is no generation service, model download, database or account requirement.

This is a developer preview of the [WavID thesis](https://wavewarz.info/wavid),
not a complete identity protocol. It is not yet installed on WaveWarz.info.

## Run

Use Node.js 22.12 or newer (Node 24 LTS recommended).

```sh
npm ci --ignore-scripts
npm run dev
```

Open `http://127.0.0.1:18990/`. To inspect the distributable site:

```sh
npm test
npm run build
npm run preview
```

Stop the dev server before previewing, or use `npm run preview -- --port 18991`.
Serve over HTTP locally or HTTPS when hosted; opening `index.html` directly from
disk is unsupported. Relative build assets support paths such as `/WavID/`.
Only `dist/` needs static hosting. There are no external fonts, analytics, remote
model calls or runtime packages beyond React. Development dependencies occupy
about 43 MB on the initial Linux installation.

## Explore and export

- Four frozen public observations open immediately without the live API:
  OxQuan, GodclouD, frameworkfortune and BetterCallZaal.
- Search or filter the collection; explicitly load the current WaveWarz public
  leaderboards when wanted. A failed refresh leaves the current collection intact.
- The material-v1 form opens paused at frame 88. Play, scrub its eight-second
  timeline, or use focus view. Geometry runs in a bounded browser worker so
  controls remain responsive. Playback stops when the page hides.
- **Form** explains anatomy and song bands. **History** inspects recorded songs
  and compares held/imported checkpoints for the same artist. **Proof** exposes
  the source → rules → form relationship and copyable fingerprints.
- **Download still** saves the displayed frame. **Save definition** preserves
  the reproducible checkpoint; importing it verifies the entire file and
  regenerates its definition before accepting it.
- **Create identity kit** packages a 1080 or 2160 square PNG, portable definition,
  and unsigned receipt in one ZIP. The receipt hashes the exact PNG bytes and
  records its source, definition, material, renderer version and displayed frame.

Collections and comparison baselines live only in the current browser tab.
Downloads are the persistence mechanism; keep the original JSON to reproduce
the checkpoint. No upload, profile registration, minting or account claim occurs.

## What provenance means here

The source observation, deterministic visual rules and generated anatomy can be
checked against one another. A valid hash does **not** authenticate the history,
its timestamp, the artist's controller, or platform approval. Anyone can supply
a self-consistent observation. The UI and files retain that unsigned status.

The live source is capped leaderboards, not a complete roster or career archive.
Missing songs can reflect coverage, not deletion. Material-v1 maps public battle
statistics into visual form; it does not fingerprint the recording's audio.
Activity is history, not a measure of artistic worth.

## WaveWarz developer handoff

Start with [INTEGRATION.md](docs/INTEGRATION.md), then review the
[release evidence and remaining work](docs/RELEASE-CHECKLIST.md).

- `src/core/`: dependency-free normalization, strict validation, versioned
  derivation, portable integrity checks and checkpoint comparison.
- `src/renderer/`: original material-v1 geometry, explicit-frame SVG rendering
  and optional off-main-thread preparation.
- `src/studio/WavIdStudio.jsx`: reusable studio with injectable initial roster,
  refresh loader and definition observer. Styles are scoped to its root.
- `src/main.jsx`: standalone mount; replace this with the host's client route.

The core, renderer and interface remain separate modules inside one application.
WaveWarz can integrate them into its existing site; GitHub Pages is an optional
static demo, not a required second backend. Authenticated profile saves,
authoritative receipts and durable lineage belong to WaveWarz's existing account
and storage systems.

Four original fixtures lock props, material/genome hashes and full geometric
trace digests. Interface polish does not change that grammar. SVG film/background
adaptations and browser rasterization are not claimed pixel-identical to the
original video renderer. See [renderer evidence](src/renderer/README.md).

## Verification

`npm test` runs core, provenance, artifact, frame-controller and complete-renderer
regressions without browser automation dependencies. `npm run build` emits the
standalone site, worker, frozen examples and retained distribution notices.

For real-browser acceptance, start an isolated Chromium debug session on port
19223, then point the runner at a served build:

```sh
STUDIO_URL=http://127.0.0.1:18990/ node tests/browser-smoke.mjs
# Optional read-only live API acceptance:
STUDIO_LIVE_CHECK=1 node tests/browser-smoke.mjs
```

The runner writes screenshots/download evidence outside the source tree to
`/tmp/wavid-studio-acceptance/`; use a fresh `STUDIO_ARTIFACTS` directory per run.
It exercises real artwork, navigation, exports, import integrity, failure
preservation and narrow-screen layout. The independent worker/browser probe is
documented in [the renderer README](src/renderer/README.md). Narrow desktop
emulation is not a physical-phone performance test.

## Source and adoption terms

Read [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This public source review
handoff does not establish a project-wide permissive license. Preserve component
terms and public-data attribution; confirm adoption terms with the maintainer
before production integration. Referenced songs, artist names and artwork are
not licensed by this repository.
