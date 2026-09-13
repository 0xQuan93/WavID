import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {transformWithOxc} from 'vite';
import {canonicalSha256} from '../src/core/index.mjs';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';

// Captured from the ORIGINAL Baby Blue material-v1 composition, not the optimized
// browser implementation, on 2026-09-13. Original source SHA-256 is recorded below.
// All three temporal fields are included: current, frame -2 and frame -6.
// Each digest covers JSON of complete paths, accents, widths, opacities and dashes.
// RNG vectors came from installed Remotion 4.0.518. No original checkout, Remotion,
// global TypeScript installation, browser, temporary writes or new dependency is
// needed to run this regression: Vite's existing Oxc compiler strips the TS types.
const GOLDENS = {
  "sourceSha256": "935a4428d4524f314c2a92d373f458bb98dcdd090ddda5bd291f0ed75ca6d1a9",
  "random": [
    [
      "",
      0.26642920868471265
    ],
    [
      "hello",
      0.41293257870711386
    ],
    [
      "🌊",
      0.657720829360187
    ],
    [
      "quantum-quil:material-v1:0005:material-phase",
      0.3177800599951297
    ],
    [
      "quantum-quil:wavid:artist:production:v1:wavewarz:audius:_0xquan:loop-duration",
      0.48309446359053254
    ],
    [
      "seed\u0000label",
      0.12068936694413424
    ],
    [
      "🎵波形",
      0.5720568273682147
    ]
  ],
  "fixtures": {
    "oxquan": {
      "propsSha256": "C43B97E3AB466AD5AB09EAB7AF01D2768A6C737D6120D356BAD550E14965D0B4",
      "duration": 240,
      "frames": {
        "0": "fd26ecc3e783f1a5f355f657e500411175830661a8fabddf82bff9119f738687",
        "88": "2b6a903b1ab65994fc35db54cd2c3c6bae3b1b856ffd3212d87c4d071c6305b3",
        "239": "f28dcba13568aedadb85eede55a584d6cc9847a5297d927c826732ca8731a8f8"
      }
    },
    "godcloud": {
      "propsSha256": "93065F68498405F618192DECB0861B8D1AA345CB701D5C610CAE48EC30A0492F",
      "duration": 240,
      "frames": {
        "0": "e8c47fc72785b25aa06e3b0133441fe08568d8154eeb1f874cea50c87c5d4e7e",
        "88": "b88128a2295fea6b8e0f065d40f44bc2aae12670907aab53516714b11839abad",
        "239": "89733b69a7cb163ddcced7a934cdf83161f9a371b525ff1167205c58dc356361"
      }
    },
    "bettercallzaal": {
      "propsSha256": "37D01841789CE55AE5C4DD14F7C27F620CA78C79181B55192EAEA01747556E4C",
      "duration": 240,
      "frames": {
        "0": "c171cb365f17709502d1e2f403574790eb7392fdd26596a15ef0454dee3083c1",
        "88": "231652a2b8c21f398d2e3e771cbcbe1834bd60f171d324eba0eba27efdfc35ca",
        "239": "6e231cf7af1656277cdfb19526b920d378634c1f5f32ad471b34b9881b9c4cb5"
      }
    },
    "frameworkfortune": {
      "propsSha256": "E3D9C589294CB1369D8CEA1A81DEB8F350552FFED6C1D3B26BB56FCD25D003EA",
      "duration": 240,
      "frames": {
        "0": "d954906e9815fbcd17dab2c792000cf6b1f8118061e00220937f4a5683caa4d5",
        "88": "65493e7c24500a0970dbb2a9badfaeb0bf46f7e5de89c0d764da032197b0ff77",
        "239": "5e6f20b1f63ae1867f5134cd74b8ded0dd04c81c2d36360ae86bbf9a0d0be29d"
      }
    }
  }
};

const sourceText = file => readFile(new URL(`../src/renderer/${file}`, import.meta.url), 'utf8');
const moduleUrl = async (source, name) => {
  const {code} = await transformWithOxc(source, name);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
};
const randomUrl = await moduleUrl(await sourceText('random.ts'), 'random.ts');
const {random} = await import(randomUrl);
const source = await sourceText('material.tsx');
const start = source.indexOf('export type QuantumQuilMaterialPoint');
const end = source.indexOf('const MaterialPhosphorBody');
assert.ok(start >= 0 && end > start, 'material geometry boundary must remain identifiable');
const geometryUrl = await moduleUrl(
  `import {random} from ${JSON.stringify(randomUrl)};\n${source.slice(start, end)}\nexport {makeLivingTraceField, getSignalFault};`,
  'material-geometry.ts',
);
const {makeLivingTraceField, getSignalFault, prepareMaterialFrame} = await import(geometryUrl);
const loopUrl = await moduleUrl(
  (await sourceText('quantum-quil.ts')).replace('from "./random"', `from ${JSON.stringify(randomUrl)}`),
  'quantum-quil.ts',
);
const {getQuantumQuilLoopSpec} = await import(loopUrl);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Independent original-source captures, compared with the optimized renderer on
// Node 22.23.2 / V8 12.4, Node 24.21.0 / V8 13.6 and Node 26.8.1 / V8 14.6.
// All 12 frame sets match exactly within each runtime. Across Node 22 vs 24/26,
// all path/dash strings match; 126 style scalars differ by <= 2.23e-16.
// Only the four SVG opacity/width scalars are rounded in this TEST digest, to
// 12 decimal places. Path coordinates, activity, RNG and identity hashes stay exact.
// These supplemental hashes come from the ORIGINAL source, not a new renderer.
const STYLE_GOLDENS = {
  oxquan: {
    0: '63baf3dd191ee729da76250c66ce5ba0f6ab4cfba0eb5c44348df667f5c00fb6',
    88: '321d8affd293fb0571b0c70bbf403d0655b0933455710219d41650d6235e55a6',
    239: 'f18f18c8628685d13b9b6773035d27aa13bfb8f8e4e2f25a594454b96a1f67f4',
  },
  godcloud: {
    0: 'ce6b05030ebcfb6ff472cc1bca8691908c7f65f02d8771a94e442d1ca7703f66',
    88: 'eb2e25b9b6cab874462a26dbecbad57f6c4e26634fa64883c792552e62488935',
    239: '9401c757e7272a7cf37a87f78ec96d9120d79877953d27c5f52daa68861e161f',
  },
  bettercallzaal: {
    0: 'b6091aaddebdc7abfc15c8780f38da1c1cb4174a0dac189ff6f8b03adf4504c7',
    88: '705abc3fd38790af028201c79e812848e332f9d71ab9b32ab53ae1b8d38c8e2b',
    239: 'e37b582dd0198cfcbde3ac74d54c87e6abff965e9ae8dd6f0cca3a07f5bb7f43',
  },
  frameworkfortune: {
    0: 'd8092fddafecba9433e9a4dccfc8f6c9812f8a862a7f4354b44b552a5a052b66',
    88: '1f87360ff92f95984287ed73c0e062d20dbd598e7f2ae11fcddc994d83525cc1',
    239: '85e24ce439c2499c42b7807b696e85a27ec4eccde815a632263e6310d5b9bf65',
  },
};
const STYLE_FIELDS = new Set(['opacity', 'accentOpacity', 'width', 'accentWidth']);
const styleHash = value => createHash('sha256').update(JSON.stringify(value, (key, field) => {
  if (!STYLE_FIELDS.has(key)) return field;
  assert.ok(Number.isFinite(field), `Finite numeric style field required: ${key}`);
  return Number(field.toFixed(12));
})).digest('hex');
const exactReferenceRuntime = process.arch === 'x64' && new Set([
  '24.21.0/13.6.233.17-node.53',
  '26.8.1/14.6.202.34-node.28',
]).has(`${process.versions.node}/${process.versions.v8}`);
function assertOriginalFrame(value, artist, frame, label) {
  assert.equal(styleHash(value), STYLE_GOLDENS[artist][frame], `${label}: exact paths / 12-decimal styles`);
  if (exactReferenceRuntime) assert.equal(hash(value), GOLDENS.fixtures[artist].frames[frame], `${label}: exact reference runtime`);
}
const TAU = Math.PI * 2;
const fract = value => value - Math.floor(value);

function fullFrame(props, frame, durationInFrames) {
  // These operations intentionally mirror the original frame/temporal arithmetic:
  // regrouping mathematically equivalent floating-point expressions can cause drift.
  const loopPhase = frame / durationInFrames;
  const theta = loopPhase * TAU * 2;
  const frameStep = TAU * 2 / durationInFrames;
  return [0, 2, 6].map(offset => makeLivingTraceField({
    ...props,
    theta: theta - frameStep * offset,
    fault: getSignalFault({
      ...props,
      loopPhase: offset === 0 ? loopPhase : fract(loopPhase - offset / durationInFrames),
    }),
  }));
}

test('Remotion string-seed goldens survive Unicode, cache reuse and eviction', () => {
  for (const [seed, expected] of GOLDENS.random) assert.equal(random(seed), expected);
  for (let index = 0; index < 40000; index += 1) random(`cache-eviction:${index}`);
  for (const [seed, expected] of GOLDENS.random) assert.equal(random(seed), expected);
});

test('cross-runtime digest preserves paths and meaningful style changes', () => {
  const trace = {d:'M0.00,0.00 L1.00,1.00', accentD:'M0.00,1.00', dash:'1 2',
    opacity:0.5230335617375422, accentOpacity:0.13, width:1, accentWidth:1.01, activity:0.3};
  assert.equal(styleHash(trace), styleHash({...trace,opacity:0.5230335617375421}), 'measured last-bit drift is normalized');
  for (const key of STYLE_FIELDS) assert.notEqual(styleHash(trace), styleHash({...trace,[key]:trace[key]+1e-9}), key);
  for (const key of ['d','accentD','dash']) assert.notEqual(styleHash(trace), styleHash({...trace,[key]:trace[key]+' '}), key);
  assert.notEqual(styleHash(trace), styleHash({...trace,activity:0.30000000000000004}), 'non-style numbers remain exact');
  assert.throws(()=>styleHash({...trace,opacity:NaN}), /Finite numeric style/);
});

for (const [artist, golden] of Object.entries(GOLDENS.fixtures)) {
  test(`renderer preserves original material-v1 geometry: ${artist}`, async () => {
    const fixture = JSON.parse(await readFile(new URL(`../public/fixtures/${artist}.json`, import.meta.url), 'utf8'));
    const props = fixture.expected.props;
    assert.equal(canonicalSha256(props), golden.propsSha256, 'frozen renderer input must not drift');
    const {durationInFrames} = getQuantumQuilLoopSpec(props);
    assert.equal(durationInFrames, golden.duration);
    for (const frame of Object.keys(golden.frames)) {
      const direct = fullFrame(props, Number(frame), durationInFrames);
      const prepared = prepareMaterialFrame(props, Number(frame), durationInFrames);
      assertOriginalFrame(direct, artist, frame, `frame ${frame}`);
      assertOriginalFrame(prepared, artist, frame, `prepared frame ${frame}`);
      assert.deepEqual(prepared, direct, 'preparation preserves every number exactly within the runtime');
    }
    // Revisiting the opening after warming caches must not mutate identity or output.
    assertOriginalFrame(fullFrame(props, 0, durationInFrames), artist, 0, 'warm-cache opening');
    assert.equal(canonicalSha256(props), golden.propsSha256, 'renderer must not mutate the definition');
  });
}

test('real worker transports full-quality geometry and reuses its immutable definition', async () => {
  const materialUrl = await moduleUrl(
    `export {prepareMaterialFrame} from ${JSON.stringify(geometryUrl)};
     export {getQuantumQuilLoopSpec as getQuantumQuilGenerativeOrganismLoopSpec} from ${JSON.stringify(loopUrl)};`,
    'worker-material.ts',
  );
  const workerSource = (await sourceText('frame.worker.ts')).replaceAll('from "./material"', `from ${JSON.stringify(materialUrl)}`);
  const workerUrl = await moduleUrl(workerSource, 'frame.worker.ts');
  const adapterUrl = await moduleUrl(`
    import {parentPort} from 'node:worker_threads';
    globalThis.self = {postMessage: data => parentPort.postMessage(data)};
    await import(${JSON.stringify(workerUrl)});
    parentPort.on('message', data => self.onmessage({data}));
    parentPort.postMessage({ready: true});
  `, 'node-worker-adapter.mjs');
  const worker = new Worker(new URL(adapterUrl), {type: 'module'});
  try {
    assert.deepEqual((await once(worker, 'message'))[0], {ready: true});
    const fixture = JSON.parse(await readFile(new URL('../public/fixtures/oxquan.json', import.meta.url), 'utf8'));
    for (const [id, frame] of [[1, 88], [2, 239]]) {
      const response = once(worker, 'message');
      worker.postMessage({id, frame, ...(id === 1 ? {props: fixture.expected.props} : {})});
      const [data] = await response;
      assert.equal(data.id, id);
      assert.equal(data.error, undefined);
      assertOriginalFrame(data.traces, 'oxquan', frame, 'worker original-source parity');
      assert.deepEqual(data.traces, fullFrame(fixture.expected.props, frame, 240), 'worker transports every number exactly within the runtime');
    }
  } finally { await worker.terminate(); }
});
