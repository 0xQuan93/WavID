# Release evidence and remaining work

Studio 0.2.0 · reviewed September 13, 2026. This is a developer-review
handoff, not evidence of a live WaveWarz integration or Pages deployment.
The release commit is the commit containing this document; use `git rev-parse HEAD`
when archiving or reporting it.

## Verified release candidate

- [x] All five local test files pass: core, provenance, artifact, frame controller
  and renderer. Tests cover complete portable regeneration, tampering, strict
  inputs, checkpoint comparison, bounded worker requests and ZIP structure.
- [x] Four frozen artists preserve original props/material/genome commitments
  and geometric paths at frames 0, 88 and 239. Reference-runtime raw digests are
  retained; cross-runtime goldens normalize only four scalar style fields to 12
  decimals. Measured Node 22/26 drift is at most 2.22e-16 and each matches the
  original engine within its runtime. Cache replay and input immutability remain
  covered; no production renderer or identity formula changed for this check.
- [x] The release visual-noise helper is separately sourced from public-domain
  Mulberry32 and the documented UTF-16 polynomial. Original RNG and complete
  geometry regressions pass unchanged; pinned sources are retained.
- [x] Production build succeeds. The measured static candidate is about 374 KB
  across 13 files, including the worker, four fixtures, MIT license and notices.
  No model, Remotion runtime, database or generation service is required.
- [x] Real Chromium acceptance passes on the production build at a `/WavID/`
  subpath: search, artist switching, focus view, Arrow/Home/End tab navigation,
  play/pause, imports, tamper rejection, checkpoint comparison and failed-refresh
  preservation.
- [x] Narrow 390px layout has no horizontal overflow; desktop, narrow layout,
  export dialog and an exported still were inspected. This is not real-phone or
  cross-browser performance evidence.
- [x] Actual 1080px PNG and 2160px identity-kit downloads pass. Independently
  hashed PNG bytes from the ZIP match its receipt. Receipt/source/definition/
  envelope commitments agree, and the included identity regenerates.
- [x] Live public refresh returned 92 artist records during acceptance.
  Leaderboard coverage remains bounded, not a complete roster guarantee.
- [x] Worker browser tests cover actual module-worker round trips, identity
  replacement, seeking, cancellation/resumption and frame-to-SVG agreement.
  A local 10ms heartbeat measured 15.3ms p95 during worker rendering versus
  233.7ms for synchronous geometry; this is UI responsiveness, not faster geometry.
- [x] The studio starts paused and stops playback on page hide. The worker
  disposes on hide, identity replacement, disable and unmount.
- [x] Frozen fixtures contain historical public identifiers, song records, URLs
  and a public wallet where supplied; no local absolute source path, bundled
  audio or remote artwork bitmap is included.
- [x] Distribution notices and random-source documentation are emitted and
  accessible under the tested deployment subpath.
- [x] [Integration guidance](INTEGRATION.md) documents reusable components,
  immutable inputs, coverage limits, version boundaries, host-owned auth/storage
  and the difference between integrity, authority, geometry and pixels.

## Publication verification

- [x] The implementation commit `ca408dc` is pushed to the public
  [review branch](https://github.com/0xQuan93/WavID/tree/feat/browser-studio-0.2),
  preserving the existing thesis and main history. Later handoff commits retain
  the same versioned identity grammar.
- [x] A separate source copy in the release repository installs dependencies from
  the lockfile, passes all five test files, and builds the same application assets.
- [x] Inspect staged files and built artifacts for private paths, credentials,
  browser evidence, dependency caches and unrelated source before publication.
- [ ] Record the result of the repository's Node 22/24 CI checks after push.

Repository publication does not deploy the site. Pages configuration, domain
changes and WaveWarz integration are deliberately not performed by this branch.

## Pending for official adoption

- [x] Quan selected MIT for the source he owns. Root and studio licenses are
  included; component notices and public-data attribution remain separate.
- [ ] Complete roster/history coverage, stable artist IDs and explicit coverage
  metadata supplied by WaveWarz. Missing songs may be a leaderboard artifact.
- [ ] Replace heuristic public-name associations with the host's verified
  identity/controller mapping for any official save flow.
- [ ] Implement authenticated checkpoint storage, immutable lineage and
  authoritative receipts in WaveWarz's existing application.
- [ ] Establish phone performance on real devices and check an additional
  browser engine. Do not promise 30fps playback from desktop measurements.
- [ ] Artist feedback across varied histories; ensure form and motion stay
  expressive without representing activity as artistic merit.
- [ ] Version any future material/renderer changes or video export capability
  while retaining reproduction of earlier checkpoints.

The studio verifies unsigned file relationships. It does not authenticate artist
control, certify ownership, provide trusted timestamps, mint or publish profiles.
Those boundaries are part of the implementation, not merely this checklist.
