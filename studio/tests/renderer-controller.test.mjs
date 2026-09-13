import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameController} from '../src/renderer/frame-controller.mjs';

function harness(overrides = {}) {
  const messages = [], frames = [], errors = [];
  const worker = {
    terminated: false,
    postMessage(message) { messages.push(message); },
    terminate() { this.terminated = true; },
  };
  const props = {seed: 'immutable-fixture'};
  const controller = createFrameController({createWorker: () => worker, props,
    onFrame: frame => frames.push(frame), onError: error => errors.push(error), ...overrides});
  return {controller, worker, props, messages, frames, errors};
}

test('queue is bounded to the running frame and latest pending frame', () => {
  const {controller, worker, props, messages, frames} = harness();
  controller.request(0);
  for (let frame = 1; frame <= 1000; frame += 1) controller.request(frame);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].props, props);
  worker.onmessage({data: {id: 1, traces: ['opening']}});
  assert.equal(frames[0].frame, 0);
  assert.equal(frames[0].props, props);
  assert.deepEqual(messages[1], {id: 2, frame: 1000});
  worker.onmessage({data: {id: 2, traces: ['latest']}});
  assert.equal(frames[1].frame, 1000);
  assert.equal(messages.length, 2);
});

test('cancellation terminates computation and ignores late replies and queued work', () => {
  const {controller, worker, messages, frames, errors} = harness();
  controller.request(88);
  controller.request(89);
  controller.dispose();
  assert.equal(worker.terminated, true);
  worker.onmessage({data: {id: 1, traces: ['stale']}});
  worker.onerror(new Error('late'));
  controller.request(90);
  assert.equal(messages.length, 1);
  assert.equal(frames.length, 0);
  assert.equal(errors.length, 0);
});

test('worker errors discard pending work and report an actionable error once', () => {
  const {controller, worker, messages, frames, errors} = harness();
  controller.request(1);
  controller.request(2);
  worker.onmessage({data: {id: 1, error: 'Calculation failed.'}});
  worker.onerror(new Error('late'));
  assert.equal(worker.terminated, true);
  assert.equal(messages.length, 1);
  assert.equal(frames.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Calculation failed/);
});

test('obsolete request IDs cannot commit geometry or advance the queue', () => {
  const {controller, worker, messages, frames} = harness();
  controller.request(12);
  controller.request(13);
  worker.onmessage({data: {id: 0, traces: ['wrong']}});
  assert.equal(messages.length, 1);
  assert.equal(frames.length, 0);
  worker.onmessage({data: {id: 1, traces: ['correct']}});
  assert.equal(frames[0].frame, 12);
  assert.equal(messages[1].frame, 13);
});

test('unavailable workers produce an error without synchronous geometry work', () => {
  const {controller, errors} = harness({createWorker: () => {throw new Error('Worker blocked.');}});
  controller.request(88);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Worker blocked/);
});
