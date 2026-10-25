import test from 'node:test';
import assert from 'node:assert/strict';
import {previewFrameAt} from '../src/studio/playback.mjs';
import {planSilentLoop} from '../src/studio/loop-plan.mjs';
import {inspectAvcMp4, muxAvcMp4} from '../src/studio/mp4-mux.mjs';

const provenance = {
  schema: 'wavid-browser-loop/1.0',
  audio: 'none',
  timelineFps: 30,
  sampleFps: 15,
  frameCount: 4,
  step: 2,
  width: 1080,
  height: 1080,
  durationSeconds: 8,
  mapping: 'wavewarz-roster-to-material-v1/1.0.0',
  renderer: {id: 'wavid-browser-svg', version: '0.2.0'},
  encoder: 'webcodecs-avc',
  productionMaster: false,
  claims: {signatureVerified: false, artistControlProven: false, audioSynced: false},
};

test('preview clock visits every material frame and closes the 8 second loop', () => {
  const seen = new Set();
  for (let ms = 0; ms < 8000; ms += 1) seen.add(previewFrameAt({startFrame: 0, elapsedMs: ms}));
  assert.equal(seen.size, 240);
  assert.equal(previewFrameAt({startFrame: 88, elapsedMs: 0}), 88);
  assert.equal(previewFrameAt({startFrame: 88, elapsedMs: 8000}), 88);
  assert.equal(previewFrameAt({startFrame: 239, elapsedMs: 34}), 0);
  assert.equal(previewFrameAt({startFrame: 10, elapsedMs: 480 * (1000 / 60)}), previewFrameAt({startFrame: 10, elapsedMs: 8000}));
  assert.throws(() => previewFrameAt({startFrame: -1, elapsedMs: 0}), /outside/);
  assert.throws(() => previewFrameAt({startFrame: 0, elapsedMs: -1}), /nonnegative/);
});

test('the replaced 15Hz stepper skipped odd material frames', () => {
  let frame = 0;
  const seen = new Set([0]);
  let previous = 0;
  for (let now = 0; now <= 8000; now += 1000 / 60) {
    if (now - previous >= 1000 / 15) {
      const elapsedFrames = Math.max(1, Math.round((now - previous) * 30 / 1000));
      previous = now;
      frame = (frame + elapsedFrames) % 240;
      seen.add(frame);
    }
  }
  assert.equal(seen.has(1), false);
  assert.ok(seen.size < 240);
});

test('silent loop plans keep an 8 second material cycle and no audio', () => {
  const full = planSilentLoop({sampleFps: 30});
  assert.equal(full.audio, 'none');
  assert.equal(full.durationSeconds, 8);
  assert.equal(full.frameCount, 240);
  assert.deepEqual(full.frames.slice(0, 3), [0, 1, 2]);
  assert.equal(full.frames[239], 239);
  const half = planSilentLoop({sampleFps: 15});
  assert.equal(half.frameCount, 120);
  assert.equal(half.step, 2);
  assert.equal(half.frames[44], 88);
  assert.equal(half.frames.at(-1), 238);
  const third = planSilentLoop({sampleFps: 10});
  assert.equal(third.frameCount, 80);
  assert.equal(third.frames[1], 3);
  assert.equal(third.frames.includes(88), false);
  assert.equal(third.durationSeconds, 8);
  assert.throws(() => planSilentLoop({sampleFps: 24}), /10, 15, or 30/);
  assert.throws(() => planSilentLoop({sampleFps: 30, durationInFrames: 120}), /material-v1/);
});

test('silent loop MP4 is video-only, exact-duration, and does not claim a master', () => {
  const samples = [0, 1, 2, 3].map((index) => ({key: index % 2 === 0, data: Uint8Array.of(index + 1, 2, 3, 4)}));
  const description = Uint8Array.of(1, 0x4d, 0x00, 0x28, 0xff, 0xe1, 0x00);
  const file = muxAvcMp4({width: 1080, height: 1080, fps: 15, samples, description, userData: provenance});
  const info = inspectAvcMp4(file);
  assert.equal(info.brands, 'isom');
  assert.equal(info.timescale, 90000);
  assert.equal(info.sampleCount, 4);
  assert.equal(info.sampleDelta, 6000);
  assert.equal(info.durationTicks / info.timescale, 4 / 15);
  assert.equal(info.firstKeyframe, 1);
  assert.equal(info.keyframeCount, 2);
  assert.equal(info.width, 1080);
  assert.equal(info.height, 1080);
  assert.deepEqual(info.handlers, ['vide']);
  assert.equal(file.subarray(info.chunkOffset, info.chunkOffset + 4).join(','), '1,2,3,4');
  assert.equal(info.userData.audio, 'none');
  assert.equal(info.userData.productionMaster, false);
  assert.equal(info.userData.claims.audioSynced, false);
  assert.throws(() => muxAvcMp4({width: 1080, height: 1080, fps: 15, samples, description, userData: {...provenance, audio: 'track'}}), /audio/);
  assert.throws(() => muxAvcMp4({width: 1080, height: 1080, fps: 15, samples, description, userData: {...provenance, productionMaster: true}}), /production master/);
  assert.throws(() => muxAvcMp4({width: 1080, height: 1080, fps: 15, samples: samples.map((sample) => ({...sample, key: false})), description, userData: provenance}), /keyframe/);
  assert.throws(() => muxAvcMp4({width: 720, height: 720, fps: 15, samples, description, userData: provenance}), /1080 or 2160/);
});
