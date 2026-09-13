# Third-party notices

These notices identify code and source data incorporated into WavID Browser
Studio. They do not change the terms of the original components or grant rights
to referenced music, artist names or artwork.

## React, React DOM and Scheduler

The browser bundle uses React 19.2.5, React DOM 19.2.5 and Scheduler 0.27.0.
All three carry the following MIT license, reproduced from their installed
package `LICENSE` files:

```text
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Seeded-number compatibility

The release's visual-noise helper uses the documented UTF-16 31-polynomial and
Mulberry32, sourced from Tommy Ettinger's CC0 original and bryc's public-domain
JavaScript reference. [RANDOM-SOURCES.md](src/renderer/RANDOM-SOURCES.md) records
pinned primary sources, the adaptation and exact-compatibility boundary.
These are visual seeds, not cryptographic identity commitments.

The preliminary extraction had copied the helper from Remotion 4.0.518. That
implementation was replaced before this public handoff; the original
[Remotion terms](src/renderer/REMOTION-LICENSE.md) are retained as historical
source documentation, not relicensed or represented as MIT. There is no Remotion
runtime dependency. The replacement's provenance is explicit, not a claim to
change the terms of the earlier copy.

## ArtistOS extraction

The material-v1 mapper and waveform geometry were extracted from Quan's ArtistOS
WavID implementation. Original composition hashes and the precise adaptation
boundary are recorded in [src/renderer/README.md](src/renderer/README.md).
These are the WavID project's source provenance, not a claim that Remotion owns
the WavID grammar or artist-derived anatomy.

## Public source observations

The four JSON fixtures contain historical observations attributed to the
[WaveWarz public API](https://wavewarz.info/api-docs), with retrieval/checkpoint
times and source commitments. Records include artist identifiers, a public
wallet where supplied, song titles, statistics and links to Audius tracks and
artwork. No audio files or remote artwork bitmap files are bundled by these
fixtures. Filesystem source paths were removed from their public projection.

Public accessibility is not a license to the underlying songs or artwork.
Preserve the historical timestamps and unverified-control status, and do not
represent an example fixture as artist endorsement of the browser studio.

## Development tooling

`package-lock.json` pins Vite and its dependency tree. These build tools retain
their own notices in their installed packages; the runtime application does not
ship the entire development tree. If distributing a dependency-inclusive archive,
retain the licenses belonging to every included package. Exclude `node_modules/`
and local build caches from the public source handoff.
