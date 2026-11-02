// Reed-Solomon over GF(2^8), polynomial 0x11d, first consecutive root α^0.
// Systematic code: 32 data bytes and 16 parity bytes, correcting 8 byte errors.
// The tables and the Berlekamp-Massey / Chien / Forney steps follow the
// public-domain layout in "Reed–Solomon codes for coders" (fcr = 0).

const POLY = 0x11d;
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

let value = 1;
for (let i = 0; i < 255; i += 1) {
  EXP[i] = value;
  LOG[value] = i;
  value <<= 1;
  if (value & 0x100) value ^= POLY;
}
for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];

function mul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function inv(a) {
  if (a === 0) throw new Error('Reed-Solomon division by zero.');
  return EXP[255 - LOG[a]];
}

function polyAdd(p, q) {
  const diff = p.length - q.length;
  const left = diff >= 0 ? p : Array(q.length - p.length).fill(0).concat(p);
  const right = diff <= 0 ? q : Array(p.length - q.length).fill(0).concat(q);
  return left.map((item, index) => item ^ right[index]);
}

function polyScale(p, scalar) {
  return p.map((item) => mul(item, scalar));
}

function polyMul(p, q) {
  const out = Array(p.length + q.length - 1).fill(0);
  for (let j = 0; j < q.length; j += 1) {
    for (let i = 0; i < p.length; i += 1) out[i + j] ^= mul(p[i], q[j]);
  }
  return out;
}

function polyEval(poly, x) {
  let y = poly[0];
  for (let i = 1; i < poly.length; i += 1) y = mul(y, x) ^ poly[i];
  return y;
}

function polyDiv(dividend, divisor) {
  const out = dividend.slice();
  for (let i = 0; i < dividend.length - (divisor.length - 1); i += 1) {
    const coef = out[i];
    if (coef === 0) continue;
    for (let j = 1; j < divisor.length; j += 1) {
      if (divisor[j] !== 0) out[i + j] ^= mul(divisor[j], coef);
    }
  }
  return [out.slice(0, dividend.length - divisor.length + 1), out.slice(dividend.length - divisor.length + 1)];
}

let generator = [1];
for (let i = 0; i < 16; i += 1) generator = polyMul(generator, [1, EXP[i]]);

export function rsEncode(message) {
  if (!(message instanceof Uint8Array) || message.length !== 32) {
    throw new Error('Wave-code data must be 32 bytes.');
  }
  const out = Array(48).fill(0);
  for (let i = 0; i < 32; i += 1) out[i] = message[i];
  for (let i = 0; i < 32; i += 1) {
    const coef = out[i];
    if (coef === 0) continue;
    for (let j = 1; j < generator.length; j += 1) out[i + j] ^= mul(generator[j], coef);
  }
  for (let i = 0; i < 32; i += 1) out[i] = message[i];
  return Uint8Array.from(out);
}

function syndromes(codeword) {
  const synd = [0];
  for (let i = 0; i < 16; i += 1) synd.push(polyEval(codeword, EXP[i]));
  return synd;
}

function errorLocator(synd) {
  let errLoc = [1];
  let oldLoc = [1];
  for (let i = 0; i < 16; i += 1) {
    let delta = synd[i + 1];
    for (let j = 1; j < errLoc.length; j += 1) delta ^= mul(errLoc[errLoc.length - 1 - j], synd[i + 1 - j]);
    oldLoc = oldLoc.concat([0]);
    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const next = polyScale(oldLoc, delta);
        oldLoc = polyScale(errLoc, inv(delta));
        errLoc = next;
      }
      errLoc = polyAdd(errLoc, polyScale(oldLoc, delta));
    }
  }
  while (errLoc.length && errLoc[0] === 0) errLoc.shift();
  const errors = errLoc.length - 1;
  if (errors * 2 > 16) return null;
  return errLoc;
}

function errorPositions(locator, length) {
  const reversed = locator.slice().reverse();
  const positions = [];
  for (let i = 0; i < length; i += 1) {
    if (polyEval(reversed, EXP[i]) === 0) positions.push(length - 1 - i);
  }
  if (positions.length !== locator.length - 1) return null;
  return positions;
}

function correct(codeword, synd, positions) {
  const coefPos = positions.map((position) => codeword.length - 1 - position);
  let locator = [1];
  for (const position of coefPos) locator = polyMul(locator, polyAdd([1], [EXP[position], 0]));
  const [, remainder] = polyDiv(polyMul(synd.slice().reverse(), locator), [1].concat(Array(locator.length).fill(0)));
  const evaluator = remainder.slice().reverse();
  const roots = coefPos.map((position) => EXP[position % 255]);
  const corrected = codeword.slice();
  for (let i = 0; i < roots.length; i += 1) {
    const xi = roots[i];
    const xiInv = inv(xi);
    let prime = 1;
    for (let j = 0; j < roots.length; j += 1) {
      if (j !== i) prime = mul(prime, 1 ^ mul(xiInv, roots[j]));
    }
    let magnitude = polyEval(evaluator.slice().reverse(), xiInv);
    magnitude = mul(xi, magnitude);
    magnitude = mul(magnitude, inv(prime));
    corrected[positions[i]] ^= magnitude;
  }
  return corrected;
}

export function rsDecode(codeword) {
  if (!(codeword instanceof Uint8Array) || codeword.length !== 48) return null;
  const symbols = Array.from(codeword);
  const synd = syndromes(symbols);
  if (synd.every((item) => item === 0)) return codeword.slice(0, 32);
  const locator = errorLocator(synd);
  if (!locator) return null;
  const positions = errorPositions(locator, symbols.length);
  if (!positions) return null;
  const fixed = correct(symbols, synd, positions);
  if (!syndromes(fixed).every((item) => item === 0)) return null;
  return Uint8Array.from(fixed.slice(0, 32));
}
