# Stable visual noise: source and compatibility

The 0.2 release replaces the preliminary Remotion-derived `random.ts` helper
with a separately sourced implementation of the same arithmetic contract:

1. Evaluate the 31-polynomial over UTF-16 code units modulo 2^32, starting at zero.
   This implements the formula in [Oracle's String.hashCode specification](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html#hashCode()).
   It does not copy JDK implementation source. Multiplication by 31 is exact at
   these integer magnitudes in JavaScript before truncation to signed 32 bits.
2. Take the first Mulberry32 sample from that seed and divide its unsigned
   32-bit output by 2^32. The implementation follows Tommy Ettinger's original
   unsigned arithmetic and bryc's JavaScript treatment of multiplication/shifts.
3. Memoize up to 32,768 seed results. Eviction changes cost, never results.

## Primary sources

- [Tommy Ettinger, Mulberry32 (2017), pinned revision fc93b8a](https://gist.github.com/tommyettinger/46a874533244883189143505d203312c/fc93b8ad259c09a3635d80ed12a05309120795dc).
  The author dedicates the software to the public domain under
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), without warranty.
- [bryc, JavaScript Mulberry32, pinned commit 88c1317](https://github.com/bryc/code/blob/88c1317ea6f9b25c153afa9c369c365fed11b482/jshash/PRNGs.md#mulberry32).
  The source explicitly states: “License: Public domain.”

This records an alternative source basis, not a retroactive change to Remotion's
terms. `REMOTION-LICENSE.md` remains as historical extraction documentation;
the release helper is based on the sources above and contains no runtime import
from Remotion. The original WavID composition/grammar provenance is separate.

## Fidelity and scope

Only the first draw is used for each complete string seed. Do not switch to a
stateful stream, code-point iteration, another PRNG, or another hash polynomial:
doing so would change historical forms. Original RNG vectors (including cache
eviction) and complete geometry digests remain release regressions.

This generator is deliberately retained for visual compatibility, not chosen for
cryptographic security or statistical simulation. Provenance commitments use
SHA-256 in `src/core/`, never this 32-bit visual-noise function.
