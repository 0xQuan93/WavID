const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const TIMESCALE = 90000;
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'dinf', 'stbl', 'udta']);

const concat = (parts) => {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
const u16 = (value) => { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value); return bytes; };
const u32 = (value) => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value); return bytes; };
const fourcc = (value) => textEncoder.encode(value);
const box = (type, ...parts) => { const body = concat(parts); return concat([u32(body.length + 8), fourcc(type), body]); };

const IDENTITY_MATRIX = concat([
  u32(0x00010000), u32(0), u32(0),
  u32(0), u32(0x00010000), u32(0),
  u32(0), u32(0), u32(0x40000000),
]);

function avc1Entry(width, height, description) {
  const name = new Uint8Array(32);
  const label = textEncoder.encode('WavID');
  name[0] = label.length;
  name.set(label, 1);
  return box('avc1', concat([
    new Uint8Array(6),
    u16(1),
    u16(0), u16(0), new Uint8Array(12),
    u16(width), u16(height),
    u32(0x00480000), u32(0x00480000),
    new Uint8Array(4),
    u16(1),
    name,
    u16(0x0018),
    u16(0xffff),
    box('avcC', description),
  ]));
}

function loopProvenance(userData) {
  if (!userData || typeof userData !== 'object' || Array.isArray(userData)) throw new Error('Loop provenance must be a record.');
  if (userData.schema !== 'wavid-browser-loop/1.0') throw new Error('Unexpected loop provenance schema.');
  if (userData.audio !== 'none') throw new Error('Silent loop provenance cannot claim an audio track.');
  if (userData.productionMaster !== false) throw new Error('Browser loop provenance must not claim the production master.');
  const claims = userData.claims;
  if (!claims || claims.audioSynced !== false || claims.artistControlProven !== false || claims.signatureVerified !== false) {
    throw new Error('Loop provenance cannot claim authority or audio sync.');
  }
  const bytes = textEncoder.encode(JSON.stringify(userData));
  if (bytes.length > 8192) throw new Error('Loop provenance is too large.');
  return bytes;
}

function walk(bytes, start, end) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size = view.getUint32(offset);
    const type = textDecoder.decode(bytes.subarray(offset + 4, offset + 8));
    if (size < 8 || offset + size > end) throw new Error(`Broken MP4 box ${type || '?'} at ${offset}.`);
    const entry = {type, offset, size};
    if (CONTAINERS.has(type)) entry.children = walk(bytes, offset + 8, offset + size);
    boxes.push(entry);
    offset += size;
  }
  if (offset !== end) throw new Error(`MP4 children leave a gap before byte ${end}.`);
  return boxes;
}

function findAll(boxes, type, found = []) {
  for (const entry of boxes) {
    if (entry.type === type) found.push(entry);
    if (entry.children) findAll(entry.children, type, found);
  }
  return found;
}

/** Video-only AVC MP4. Timescale 90000 keeps 10, 15, and 30 fps on integer ticks. */
export function muxAvcMp4({width, height, fps, samples, description, userData}) {
  if (![1080, 2160].includes(width) || width !== height) throw new Error('Loop video must be a 1080 or 2160 square.');
  if (![10, 15, 30].includes(fps)) throw new Error('Loop video fps must be 10, 15, or 30.');
  if (!Array.isArray(samples) || samples.length < 1 || samples.length > 240) throw new Error('Loop video frame count must be 1 to 240.');
  if (!(description instanceof Uint8Array) || description.length < 7 || description[0] !== 1) throw new Error('H.264 decoder configuration is missing.');
  if (!samples[0].key) throw new Error('Loop video must start on a keyframe.');
  const sampleDelta = TIMESCALE / fps;
  if (!Number.isInteger(sampleDelta)) throw new Error('Frame duration is not an integer timescale tick.');
  for (const sample of samples) {
    if (!(sample.data instanceof Uint8Array) || sample.data.length < 1 || sample.data.length > 8_000_000) throw new Error('Invalid encoded frame.');
  }
  const provenance = loopProvenance(userData);
  const duration = samples.length * sampleDelta;
  const ftyp = box('ftyp', fourcc('isom'), u32(0x200), fourcc('isom'), fourcc('iso2'), fourcc('avc1'), fourcc('mp41'));
  const mvhd = box('mvhd', concat([
    u32(0), u32(0), u32(0), u32(TIMESCALE), u32(duration),
    u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0),
    IDENTITY_MATRIX, new Uint8Array(24), u32(2),
  ]));
  const tkhd = box('tkhd', concat([
    u32(0x3), u32(0), u32(0), u32(1), u32(0), u32(duration),
    u32(0), u32(0), u16(0), u16(0), u16(0), u16(0),
    IDENTITY_MATRIX, u32(width << 16), u32(height << 16),
  ]));
  const mdhd = box('mdhd', concat([
    u32(0), u32(0), u32(0), u32(TIMESCALE), u32(duration), u16(0x55c4), u16(0),
  ]));
  const hdlr = box('hdlr', u32(0), u32(0), fourcc('vide'), new Uint8Array(12), textEncoder.encode('VideoHandler\0'));
  const vmhd = box('vmhd', u32(1), u16(0), u16(0), u16(0), u16(0));
  const dinf = box('dinf', box('dref', u32(0), u32(1), box('url ', u32(1))));
  const stsd = box('stsd', u32(0), u32(1), avc1Entry(width, height, description));
  const stts = box('stts', u32(0), u32(1), u32(samples.length), u32(sampleDelta));
  const sync = samples.flatMap((sample, index) => sample.key ? [index + 1] : []);
  const stss = box('stss', u32(0), u32(sync.length), ...sync.map(u32));
  const stsc = box('stsc', u32(0), u32(1), u32(1), u32(samples.length), u32(1));
  const stsz = box('stsz', u32(0), u32(0), u32(samples.length), ...samples.map((sample) => u32(sample.data.length)));
  const stco = box('stco', u32(0), u32(1), u32(0));
  const stbl = box('stbl', stsd, stts, stss, stsc, stsz, stco);
  const minf = box('minf', vmhd, dinf, stbl);
  const mdia = box('mdia', mdhd, hdlr, minf);
  const trak = box('trak', tkhd, mdia);
  const udta = box('udta', box('WVID', provenance));
  const moov = box('moov', mvhd, trak, udta);
  const stcoOffset = 8 + mvhd.length + 8 + tkhd.length + 8 + mdhd.length + hdlr.length + 8 + vmhd.length + dinf.length + 8 + stsd.length + stts.length + stss.length + stsc.length + stsz.length;
  const mdatBody = concat(samples.map((sample) => sample.data));
  const chunkOffset = ftyp.length + moov.length + 8;
  const patched = box('stco', u32(0), u32(1), u32(chunkOffset));
  if (patched.length !== stco.length || textDecoder.decode(moov.subarray(stcoOffset + 4, stcoOffset + 8)) !== 'stco') {
    throw new Error('Could not place the video sample offset.');
  }
  moov.set(patched, stcoOffset);
  return concat([ftyp, moov, u32(mdatBody.length + 8), fourcc('mdat'), mdatBody]);
}

export function inspectAvcMp4(bytes) {
  const file = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const boxes = walk(file, 0, file.length);
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const mdhd = findAll(boxes, 'mdhd')[0];
  const stts = findAll(boxes, 'stts')[0];
  const stss = findAll(boxes, 'stss')[0];
  const stco = findAll(boxes, 'stco')[0];
  const stsd = findAll(boxes, 'stsd')[0];
  const tkhd = findAll(boxes, 'tkhd')[0];
  const wvid = findAll(boxes, 'WVID')[0];
  if (!mdhd || !stts || !stss || !stco || !stsd || !tkhd || !wvid) throw new Error('Loop MP4 is missing a required box.');
  const sampleEntry = textDecoder.decode(file.subarray(stsd.offset, stsd.offset + stsd.size));
  if (!sampleEntry.includes('avc1') || !sampleEntry.includes('avcC')) throw new Error('Loop MP4 is not AVC.');
  const handlers = findAll(boxes, 'hdlr').map((entry) => textDecoder.decode(file.subarray(entry.offset + 16, entry.offset + 20)));
  const userData = JSON.parse(textDecoder.decode(file.subarray(wvid.offset + 8, wvid.offset + wvid.size)));
  return {
    brands: textDecoder.decode(file.subarray(8, 12)),
    timescale: view.getUint32(mdhd.offset + 20),
    durationTicks: view.getUint32(mdhd.offset + 24),
    sampleCount: view.getUint32(stts.offset + 16),
    sampleDelta: view.getUint32(stts.offset + 20),
    firstKeyframe: view.getUint32(stss.offset + 16),
    keyframeCount: view.getUint32(stss.offset + 12),
    chunkOffset: view.getUint32(stco.offset + 16),
    width: view.getUint32(tkhd.offset + 84) >> 16,
    height: view.getUint32(tkhd.offset + 88) >> 16,
    handlers,
    userData,
    boxes,
  };
}
