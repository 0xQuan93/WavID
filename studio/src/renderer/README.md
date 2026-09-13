# WavID browser renderer

`<WavIdRenderer props={definition.props} frame={frame} ref={svgRef} />` renders a
self-contained accessible SVG with a 1080 × 1080 viewBox. The caller owns animation;
the component starts no timers and performs no network or file access. Frame units
use the original 30 fps timeline. Use `getQuantumQuilGenerativeOrganismLoopSpec(props)`
for duration. Serialize the root SVG for vector download or draw it onto a 1080 px
canvas for a still. IDs are scoped per React instance, allowing multiple previews.

## Responsive browser preparation

The studio uses `usePreparedWavIdFrame` to move the complete geometry calculation
into a module Worker. Render the **prepared** frame so its geometry, film texture,
timecode and downloads all describe the same moment:

```tsx
const {prepared, busy, error} = usePreparedWavIdFrame(definition?.props, requestedFrame);
return prepared ? <WavIdRenderer
  props={prepared.props}
  frame={prepared.frame}
  preparedFrame={prepared}
  ref={svgRef}
/> : <p>{error?.message ?? 'Tracing the form…'}</p>;
```

The caller owns requested-frame changes and playback policy. Start paused and
require explicit play; honor reduced motion. For a still export after seeking,
wait for `busy === false`; name it using `prepared.frame` or the SVG `data-frame`.
The renderer rejects prepared geometry belonging to another definition or frame.
Definition objects must be immutable and retain their reference until changed.

There is one worker calculation in progress and at most one pending frame. A new
request replaces that pending frame, preventing playback or fast scrubbing from
building a queue. Completed frames may be displayed while the latest one is
preparing; time advances at the caller's requested rate and may skip samples on
slower devices. This does not reduce geometry or alter the 30 fps identity timeline.
Only the displayed geometry and in-flight result are retained, with no frame atlas.
The definition is cloned to the worker once, preserving its bounded geometry caches.

Changing definitions, disabling preparation, hiding the page or unmounting cancels
the worker. Late results cannot commit. A newly selected identity never displays the
previous identity's geometry. Visibility resumes preparation of the current requested
frame; playback resumption remains the caller's choice. `enabled: false` also permits
the host to suspend work when its panel is not in use. Worker startup failures are
reported through `error`, without silently moving expensive computation onto the UI.

Vite emits the worker as a static build asset, compatible with a subpath deployment.
Other bundlers must support `new Worker(new URL('./frame.worker.ts', import.meta.url),
{type: 'module'})`; a restrictive host CSP must allow its own worker asset, typically
`worker-src 'self'`. The synchronous component remains available for hosts that own
their own preparation/export pipeline. No backend or additional package is required.

## Provenance

Extracted September 13, 2026 from Quan's ArtistOS working copy on Baby Blue:

- `CONTENT/OXQUAN-SUNO/tools/oxquan-remotion/src/compositions/quantum-quil-generative-organism.tsx`
  SHA-256 `935a4428d4524f314c2a92d373f458bb98dcdd090ddda5bd291f0ed75ca6d1a9`.
- `CONTENT/OXQUAN-SUNO/tools/oxquan-remotion/src/compositions/quantum-quil.tsx`
  SHA-256 `0702e57114f6b56fc594decde6a71ca3fd7aadcf5d2faf77ffb90f4ab526c889`.

The local repository source has identical hashes. `material.tsx` retains the
material-v1 types, geometry, random seed strings, three temporal traces, displacement,
bloom, path styling, defaults and loop duration. Remotion hooks/container and SVG ID
plumbing were adapted. Geometry execution caches anatomy embeddings, band segments,
stable trace grids, coordinates and repeated field accents through weakly keyed maps.
Far-away segment/node contributions are skipped only where their original exponential
underflows to exactly zero (outside a conservative six-width box).
`quantum-quil.ts` contains only the shared props/defaults
and loop rule, excluding the other compositions and audio processing.

`random.ts` preserves the original string-seed outputs using a UTF-16 polynomial
and a separately sourced public-domain Mulberry32 implementation. The release
replacement and pinned primary sources are documented in
[RANDOM-SOURCES.md](RANDOM-SOURCES.md). Historical Remotion extraction terms remain
in `REMOTION-LICENSE.md`; no Remotion runtime is installed.

## Fidelity and cost

Body geometry is preserved. Original HTML/CSS grit, dust, scanlines, background and
vignette are represented as SVG rectangles, patterns and gradients so downloads
contain the complete artwork. SVG/CSS filter compositing can differ between browser
engines; this is not a claim of pixel-identical reproduction of Remotion video.
1080 px is the fidelity reference size. The original non-scaling strokes are retained.

Each new frame computes three complete material fields (132 samples per trace) and
paints displacement, bloom and film noise. Mobile realtime performance is not assumed.
Start paused, respect reduced motion and hidden tabs, and use a measured low preview
frame rate. Keep frame units at 30 fps even when sampling fewer frames for playback.
Avoid regenerating the identity or mutating its anatomy to optimize playback. The
cache contract requires immutable anatomy and organism objects: replace the objects
when editing definitions. Each anatomy/organism retains at most eight seed variants;
unused anatomy/organism caches can be garbage collected. Seed memoization has a fixed
32,768-entry maximum and does not affect numeric results.

September 13 verification compared 32 complete trace fields across all four frozen
artist fixtures (frames 0, 1, 20, 40, 60, 88, midpoint and final frame) directly with
Baby Blue's original geometry: JSON representations of every path, dash, width and
opacity matched exactly. Ten thousand string-seed outputs also matched installed
Remotion exactly. Strict TypeScript and two-instance server rendering passed; SVG
references were self-contained, IDs unique and geometry finite.

Local Node CPU measurements after cache warmup were 118–177 ms per complete displayed
frame, varying by artist, before SVG painting. This roughly halves original geometry
time but does not establish mobile performance or a guaranteed 8 fps browser rate.

The release worker changes responsiveness, not that underlying computation cost.
In the isolated September 13 headless Chromium probe, five full OxQuan frames took
1.15 s through the worker; a 10 ms main-thread heartbeat had a 15.3 ms p95 and 39.7 ms
maximum interval. The synchronous geometry comparison took 1.06 s but blocked that
heartbeat for up to 233.7 ms (also its p95). Worker measurements include React/SVG
updates; the comparison measures synchronous geometry only. These are local CPU
observations, not physical-phone or graphics-compositing guarantees.

`node --test tests/renderer.test.mjs` preserves the regression independently of Baby
Blue: original-source golden hashes cover complete current/-2/-6 trace sets for all
four fixtures at frames 0, 88 and 239, plus warm-cache replay, input immutability and
Remotion RNG vectors before/after cache eviction. It uses the existing Vite/Oxc dev
dependency to load private TypeScript geometry; no global compiler or Remotion install
is required. These geometry checks do not substitute for browser pixel comparison.

The same goldens also cover `prepareMaterialFrame`, and a real Worker roundtrip
checks the complete serialized result against the original source. Controller tests
cover bounded requests, disposal, obsolete responses and startup/calculation failures.
For optional browser measurements, start Vite and an isolated Chromium CDP instance,
then run `STUDIO_URL=http://127.0.0.1:18993 CDP_PORT=19226 node tests/renderer-browser.mjs`.
It checks seeking, identity replacement, cancellation/resumption and frame-to-SVG
agreement as well as heartbeat timing. Its test harness is excluded from production.


## Cross-runtime numeric boundary

September 13 CI exposed a final-bit style difference on Node 22.23.2 (V8
12.4.254.21-node.56). The original composition identified by SHA-256 above and this
renderer were run side by side on Node 22.23.2, 24.21.0 and 26.8.1. All 12 complete
frame sets matched **exactly within each runtime**. Between Node 22 and 24/26,
every path coordinate string, dash string, trace count, activity and base width
matched. Only 126 style values differed: 111 opacity values, 13 accent opacities
and two accent widths; the largest absolute difference was 2.220446049250313e-16.

One isolated cause is directly reproducible:
`Math.pow(0.3425293929093508, 0.42)` returns `0.6376363907078255` on the tested
Node 22 and `0.6376363907078254` on Node 26. That input comes from OxQuan trace
row 16; its seed and vertical coordinate agree exactly, while the resulting
opening opacity is `0.5230335617375422` versus `0.5230335617375421`.

The renderer is unchanged. Tests add original-source digests that round only
`opacity`, `accentOpacity`, `width` and `accentWidth` to 12 decimal places.
Path/dash strings and other fields are hashed verbatim. Source, props, material,
RNG and artifact commitments retain exact checks. The original complete digests
are also asserted on the explicitly recorded x64 reference runtime pairs:
Node 24.21.0 / V8 13.6.233.17-node.53 and Node 26.8.1 / V8 14.6.202.34-node.28.
Other runtimes still run every geometry regression using the style-only digest.
Direct/prepared and worker/direct comparisons require exact same-runtime equality.
A regression confirms that path changes, 1e-9 style changes, non-style numeric
changes and non-finite style values remain detectable. No runtime rounding or
identity regeneration was introduced.
