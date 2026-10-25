import {drawSvgToCanvas} from './files.mjs';
import {muxAvcMp4} from './mp4-mux.mjs';

const BITRATE = {1080: 8_000_000, 2160: 16_000_000};
const CODEC = {1080: 'avc1.4d0028', 2160: 'avc1.4d0033'};

async function nextPaint() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Encode already-rendered SVG frames. No audio track and no frame skipping. */
export async function encodeSilentLoop({plan, size, renderFrame, userData, onProgress, signal}) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('This browser cannot encode a silent loop. Use a current Chromium-based browser.');
  }
  if (!plan || plan.audio !== 'none' || !Array.isArray(plan.frames) || plan.frames.length !== plan.frameCount) {
    throw new Error('Silent loop plan is incomplete.');
  }
  const codec = CODEC[size];
  if (!codec || !BITRATE[size]) throw new Error('Unsupported still size.');
  const requested = {
    codec,
    width: size,
    height: size,
    bitrate: BITRATE[size],
    framerate: plan.sampleFps,
    avc: {format: 'avc'},
    latencyMode: 'realtime',
    bitrateMode: 'variable',
  };
  const support = await VideoEncoder.isConfigSupported(requested);
  if (!support.supported) throw new Error(`This browser cannot encode ${size}×${size} H.264 at ${plan.sampleFps} fps.`);
  const samples = [];
  let description = null;
  let encoderError = null;
  const encoder = new VideoEncoder({
    output(chunk, meta) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const record = meta?.decoderConfig?.description;
      if (record && !description) description = new Uint8Array(record);
      samples.push({data, key: chunk.type === 'key', timestamp: chunk.timestamp});
    },
    error(error) { encoderError = error instanceof Error ? error : new Error('Video encoding failed.'); },
  });
  try {
    encoder.configure(support.config);
    const frameDuration = Math.round(1_000_000 / plan.sampleFps);
    for (let index = 0; index < plan.frames.length; index += 1) {
      if (signal?.aborted) throw new Error('Loop export cancelled.');
      if (encoderError) throw encoderError;
      const svg = await renderFrame(plan.frames[index], index);
      const canvas = await drawSvgToCanvas(svg, size);
      const frame = new VideoFrame(canvas, {timestamp: index * frameDuration, duration: frameDuration});
      encoder.encode(frame, {keyFrame: index % plan.sampleFps === 0});
      frame.close();
      onProgress?.({done: index + 1, total: plan.frames.length, phase: 'render'});
      while (encoder.encodeQueueSize > 2) {
        if (signal?.aborted) throw new Error('Loop export cancelled.');
        if (encoderError) throw encoderError;
        await nextPaint();
      }
    }
    onProgress?.({done: plan.frames.length, total: plan.frames.length, phase: 'finish'});
    await encoder.flush();
    if (encoderError) throw encoderError;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  if (signal?.aborted) throw new Error('Loop export cancelled.');
  if (!description) throw new Error('The encoder did not return H.264 configuration.');
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].timestamp < samples[index - 1].timestamp) throw new Error('The encoder reordered frames. No video file was saved.');
  }
  if (!samples[0]?.key || samples.length !== plan.frames.length) throw new Error('The encoder omitted frames. No video file was saved.');
  return new Blob([muxAvcMp4({width: size, height: size, fps: plan.sampleFps, samples, description, userData})], {type: 'video/mp4'});
}
