// Card-only scan layer, wavid-wave-code/1.
// The Audius handle and its Reed-Solomon parity are drawn as phosphor ticks
// on a dark ring, with three circular bullseyes for orientation. The center
// stays transparent so the material-v1 still shows through. This does not
// change material-v1 seeds, formulas, or fixture hashes.

import { isAudiusHandle } from './payload.mjs';
import { rsDecode, rsEncode } from './reed-solomon.mjs';

export const WAVE_CODE_CONTRACT = 'wavid-wave-code/1';
export const WAVE_VERSION = 1;
export const WAVE_HANDLE_LIMIT = 30;
export const WAVE_BIT_COUNT = 384;

const FIDUCIALS = [
  [0.075, 0.075],
  [0.925, 0.075],
  [0.075, 0.925],
];
const FIDUCIAL_RADIUS = 0.042;
const FIDUCIAL_HALO = FIDUCIAL_RADIUS * 1.28;
const BEZEL = [0.385, 0.535];
const INNER_TICK = [0.405, 0.445];
const OUTER_TICK = [0.475, 0.515];
const GUIDE = 0.46;
const TICK_DUTY = 0.6;
const INNER_RADIUS = (INNER_TICK[0] + INNER_TICK[1]) / 2;
const OUTER_RADIUS = (OUTER_TICK[0] + OUTER_TICK[1]) / 2;

const BEZEL_COLOR = [10, 16, 13, 255];
const TICK_COLOR = [214, 255, 176, 255];
const GUIDE_COLOR = [46, 92, 64, 255];
const FIDUCIAL_DARK = [8, 10, 9, 255];
const FIDUCIAL_LIGHT = [232, 245, 226, 255];

function fail(code, reason) {
  return { ok: false, code, reason, handle: null, contract: WAVE_CODE_CONTRACT };
}

export function encodeWavePayload(handle) {
  if (!isAudiusHandle(handle)) throw new Error('That handle is not a stable Audius identity.');
  if (handle.length > WAVE_HANDLE_LIMIT) {
    const error = new Error(`This handle is longer than ${WAVE_HANDLE_LIMIT} characters, so it cannot be woven into the artwork.`);
    error.code = 'wave-capacity';
    throw error;
  }
  const data = new Uint8Array(32);
  data[0] = WAVE_VERSION;
  data[1] = handle.length;
  for (let i = 0; i < handle.length; i += 1) data[2 + i] = handle.charCodeAt(i);
  return rsEncode(data);
}

function bitsFromBytes(bytes) {
  const bits = new Uint8Array(WAVE_BIT_COUNT);
  for (let i = 0; i < bytes.length; i += 1) {
    for (let bit = 0; bit < 8; bit += 1) bits[i * 8 + bit] = (bytes[i] >> (7 - bit)) & 1;
  }
  return bits;
}

function bytesFromBits(bits) {
  const bytes = new Uint8Array(48);
  for (let i = 0; i < 48; i += 1) {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) value = (value << 1) | (bits[i * 8 + bit] ? 1 : 0);
    bytes[i] = value;
  }
  return bytes;
}

function handleFromData(data) {
  if (!data || data[0] !== WAVE_VERSION) return null;
  const length = data[1];
  if (length < 1 || length > WAVE_HANDLE_LIMIT) return null;
  for (let i = 2 + length; i < 32; i += 1) if (data[i] !== 0) return null;
  let handle = '';
  for (let i = 0; i < length; i += 1) {
    const code = data[2 + i];
    if (code < 32 || code > 126) return null;
    handle += String.fromCharCode(code);
  }
  return isAudiusHandle(handle) ? handle : null;
}

function paint(data, offset, color) {
  data[offset] = color[0];
  data[offset + 1] = color[1];
  data[offset + 2] = color[2];
  data[offset + 3] = color[3];
}

function fiducialColor(distance) {
  const band = (distance / FIDUCIAL_RADIUS) * 6;
  const dark = band < 1 || (band >= 2 && band < 3) || band >= 4;
  return dark ? FIDUCIAL_DARK : FIDUCIAL_LIGHT;
}

export function renderWaveLayer(size, handle) {
  const edge = Math.round(size);
  if (!Number.isInteger(edge) || edge < 64 || edge > 4096) throw new Error('Wave-code raster size is out of range.');
  const bytes = encodeWavePayload(handle);
  const bits = bitsFromBytes(bytes);
  const data = new Uint8ClampedArray(edge * edge * 4);
  const origin = (edge - 1) / 2;
  const step = (Math.PI * 2) / WAVE_BIT_COUNT;
  for (let y = 0; y < edge; y += 1) {
    for (let x = 0; x < edge; x += 1) {
      const offset = (y * edge + x) * 4;
      let fiducial = null;
      for (const [fx, fy] of FIDUCIALS) {
        const distance = Math.hypot(x - fx * (edge - 1), y - fy * (edge - 1)) / edge;
        if (distance <= FIDUCIAL_HALO) {
          fiducial = distance;
          break;
        }
      }
      if (fiducial !== null) {
        paint(data, offset, fiducial <= FIDUCIAL_RADIUS ? fiducialColor(fiducial) : FIDUCIAL_LIGHT);
        continue;
      }
      const dx = x - origin;
      const dy = y - origin;
      const radius = Math.hypot(dx, dy) / edge;
      if (radius < BEZEL[0] || radius > BEZEL[1]) continue;
      let light = false;
      const inInner = radius >= INNER_TICK[0] && radius <= INNER_TICK[1];
      const inOuter = radius >= OUTER_TICK[0] && radius <= OUTER_TICK[1];
      if (inInner || inOuter) {
        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += Math.PI * 2;
        const slot = angle / step;
        const index = Math.floor(slot) % WAVE_BIT_COUNT;
        const frac = slot - Math.floor(slot);
        if (Math.abs(frac - 0.5) <= TICK_DUTY / 2) {
          const bit = bits[index];
          light = (bit === 0 && inInner) || (bit === 1 && inOuter);
        }
      }
      if (light) paint(data, offset, TICK_COLOR);
      else if (Math.abs(radius - GUIDE) <= 0.0016) paint(data, offset, GUIDE_COLOR);
      else paint(data, offset, BEZEL_COLOR);
    }
  }
  return { width: edge, height: edge, data, contract: WAVE_CODE_CONTRACT, handle };
}

function luminance(rgba, index) {
  return rgba[index] * 0.2126 + rgba[index + 1] * 0.7152 + rgba[index + 2] * 0.0722;
}

function otsuThreshold(rgba, width, height) {
  const hist = new Uint32Array(256);
  const stepX = Math.max(1, Math.floor(width / 240));
  const stepY = Math.max(1, Math.floor(height / 240));
  let total = 0;
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const offset = (y * width + x) * 4;
      if (rgba[offset + 3] < 16) continue;
      hist[Math.max(0, Math.min(255, Math.round(luminance(rgba, offset))))] += 1;
      total += 1;
    }
  }
  if (total < 32) return 140;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumBack = 0;
  let weightBack = 0;
  let best = 0;
  let threshold = 140;
  for (let i = 0; i < 256; i += 1) {
    weightBack += hist[i];
    if (!weightBack) continue;
    const weightFore = total - weightBack;
    if (!weightFore) break;
    sumBack += i * hist[i];
    const meanBack = sumBack / weightBack;
    const meanFore = (sum - sumBack) / weightFore;
    const between = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

function finderAt(runs) {
  const found = [];
  for (let start = 0; start + 9 <= runs.length; start += 1) {
    const slice = runs.slice(start, start + 9);
    if (slice.some((run, index) => run.dark !== (index % 2 === 0))) continue;
    const total = slice.reduce((sum, run) => sum + run.length, 0);
    if (total < 16) continue;
    const unit = total / 12;
    const expect = [2, 1, 1, 1, 2, 1, 1, 1, 2];
    let ok = true;
    for (let i = 0; i < 9; i += 1) {
      const ratio = slice[i].length / (expect[i] * unit);
      if (ratio < 0.55 || ratio > 1.55) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const center = slice[4].at + slice[4].length / 2;
    found.push({ center, total });
  }
  return found;
}

function runsAlong(binary, width, height, fixed, horizontal) {
  const runs = [];
  const limit = horizontal ? width : height;
  let dark = null;
  let length = 0;
  let at = 0;
  for (let i = 0; i < limit; i += 1) {
    const x = horizontal ? i : fixed;
    const y = horizontal ? fixed : i;
    const bit = binary[y * width + x] === 1;
    if (bit === dark) {
      length += 1;
    } else {
      if (dark !== null) runs.push({ dark, length, at });
      dark = bit;
      length = 1;
      at = i;
    }
  }
  if (dark !== null) runs.push({ dark, length, at });
  return runs;
}

function clusterFinders(points) {
  const groups = [];
  for (const point of points) {
    const group = groups.find((item) => Math.hypot(item.x - point.x, item.y - point.y) < Math.max(6, point.d * 0.45));
    if (!group) {
      groups.push({ x: point.x, y: point.y, d: point.d, n: 1 });
      continue;
    }
    group.x = (group.x * group.n + point.x) / (group.n + 1);
    group.y = (group.y * group.n + point.y) / (group.n + 1);
    group.d = (group.d * group.n + point.d) / (group.n + 1);
    group.n += 1;
  }
  return groups.filter((group) => group.n >= 2).sort((a, b) => b.d - a.d);
}

function orient(points) {
  let best = null;
  for (let i = 0; i < 3; i += 1) {
    const vertex = points[i];
    const armA = points[(i + 1) % 3];
    const armB = points[(i + 2) % 3];
    const ax = armA.x - vertex.x;
    const ay = armA.y - vertex.y;
    const bx = armB.x - vertex.x;
    const by = armB.y - vertex.y;
    const lenA = Math.hypot(ax, ay);
    const lenB = Math.hypot(bx, by);
    if (lenA < 12 || lenB < 12) continue;
    const cos = (ax * bx + ay * by) / (lenA * lenB);
    const ratio = lenA > lenB ? lenA / lenB : lenB / lenA;
    if (Math.abs(cos) > 0.28 || ratio > 1.28) continue;
    const score = Math.abs(cos) + (ratio - 1);
    if (!best || score < best.score) best = { vertex, armA, armB, score };
  }
  if (!best) return null;
  const cross = (best.armA.x - best.vertex.x) * (best.armB.y - best.vertex.y)
    - (best.armA.y - best.vertex.y) * (best.armB.x - best.vertex.x);
  const tr = cross > 0 ? best.armA : best.armB;
  const bl = cross > 0 ? best.armB : best.armA;
  return { tl: best.vertex, tr, bl };
}

function mapPoint(anchor, px, py) {
  const origin = FIDUCIALS[0][0];
  const span = FIDUCIALS[1][0] - FIDUCIALS[0][0];
  const u = (px - origin) / span;
  const v = (py - origin) / span;
  return {
    x: anchor.tl.x + u * (anchor.tr.x - anchor.tl.x) + v * (anchor.bl.x - anchor.tl.x),
    y: anchor.tl.y + u * (anchor.tr.y - anchor.tl.y) + v * (anchor.bl.y - anchor.tl.y),
  };
}

function sampleLuma(rgba, width, height, x, y) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= width || iy >= height) return 0;
  return luminance(rgba, (iy * width + ix) * 4);
}

function readBits(rgba, width, height, anchor) {
  const bits = new Uint8Array(WAVE_BIT_COUNT);
  const step = (Math.PI * 2) / WAVE_BIT_COUNT;
  for (let index = 0; index < WAVE_BIT_COUNT; index += 1) {
    const angle = -Math.PI / 2 + (index + 0.5) * step;
    let inner = 0;
    let outer = 0;
    const offsets = [-0.12, 0, 0.12];
    for (const offset of offsets) {
      const shifted = angle + offset * step;
      const innerPoint = mapPoint(anchor, 0.5 + Math.cos(shifted) * INNER_RADIUS, 0.5 + Math.sin(shifted) * INNER_RADIUS);
      const outerPoint = mapPoint(anchor, 0.5 + Math.cos(shifted) * OUTER_RADIUS, 0.5 + Math.sin(shifted) * OUTER_RADIUS);
      inner += sampleLuma(rgba, width, height, innerPoint.x, innerPoint.y);
      outer += sampleLuma(rgba, width, height, outerPoint.x, outerPoint.y);
    }
    bits[index] = outer > inner + 18 ? 1 : 0;
  }
  return bits;
}

function decodeAnchors(rgba, width, height, anchors) {
  for (const anchor of anchors) {
    const bits = readBits(rgba, width, height, anchor);
    const handle = handleFromData(rsDecode(bytesFromBits(bits)));
    if (handle) return handle;
  }
  return null;
}

export function decodeWaveImage(rgba, width, height) {
  if (!rgba || width < 32 || height < 32 || rgba.length < width * height * 4) {
    return fail('not-found', 'No WavID wave code is in this frame. Fill the view with the artwork.');
  }
  const threshold = otsuThreshold(rgba, width, height);
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    binary[i] = rgba[offset + 3] >= 16 && luminance(rgba, offset) < threshold ? 1 : 0;
  }
  const hits = [];
  const stride = height > 900 ? 2 : 1;
  for (let y = 1; y < height - 1; y += stride) {
    const across = finderAt(runsAlong(binary, width, height, y, true));
    for (const hit of across) {
      const x = Math.round(hit.center);
      if (x < 1 || x >= width - 1) continue;
      const down = finderAt(runsAlong(binary, width, height, x, false));
      const match = down.find((item) => Math.abs(item.center - y) <= Math.max(3, hit.total * 0.2));
      if (!match) continue;
      hits.push({ x: hit.center, y: match.center, d: (hit.total + match.total) / 2 });
    }
  }
  const groups = clusterFinders(hits).slice(0, 8);
  if (groups.length < 3) return fail('not-found', 'No WavID wave code is in this frame. Fill the view with the artwork.');
  const limit = groups[0].d;
  if (limit < 18) return fail('too-small', 'Move closer. The artwork is too small to read.');
  const anchors = [];
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      for (let k = j + 1; k < groups.length; k += 1) {
        const pose = orient([groups[i], groups[j], groups[k]]);
        if (!pose) continue;
        anchors.push(pose);
        anchors.push({ tl: pose.tl, tr: pose.bl, bl: pose.tr });
      }
    }
  }
  if (!anchors.length) return fail('not-found', 'No WavID wave code is in this frame. Fill the view with the artwork.');
  const handle = decodeAnchors(rgba, width, height, anchors);
  if (!handle) return fail('damaged', 'The artwork is in view, but the signal could not be read. Hold the card steady and fill the frame.');
  return { ok: true, code: 'decoded', reason: null, handle, contract: WAVE_CODE_CONTRACT };
}
