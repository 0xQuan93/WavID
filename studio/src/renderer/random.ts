/**
 * Stable visual noise: UTF-16 polynomial hash + first Mulberry32 sample.
 * Mulberry32: Tommy Ettinger (2017, CC0), JavaScript reference by bryc
 * (public domain). See RANDOM-SOURCES.md for pinned sources and derivation.
 * This is NOT cryptographic randomness. Identity commitments use SHA-256.
 */
// Bounded seed memoization saves repeated hashes inside the material point loops.
// Values are independent of call order; eviction only affects execution time.
const seeds = new Map<string, number>();
const MAX_SEEDS = 32768;

// Evaluate the documented 31-polynomial in signed 32-bit arithmetic.
// Index UTF-16 code units, not Unicode code points: old seeds depend on this.
function hash31(text: string): number {
  let result = 0;
  for (let index = 0; index < text.length; index += 1) {
    result = (result * 31 + text.charCodeAt(index)) | 0;
  }
  return result;
}

// One step of Ettinger's uint32 algorithm, using imul/>>> for JS arithmetic.
function firstMulberry32(seed: number): number {
  const state = (seed + 0x6d2b79f5) | 0;
  let mixed = Math.imul(state ^ (state >>> 15), state | 1);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}

export const random = (seed: string): number => {
  const cached = seeds.get(seed);
  if (cached !== undefined) return cached;
  const result = firstMulberry32(hash31(seed));
  if (seeds.size >= MAX_SEEDS) seeds.clear();
  seeds.set(seed, result);
  return result;
};
