import {MATERIAL_FPS, MATERIAL_FRAMES} from './playback.mjs';

export const LOOP_SAMPLE_RATES = [10, 15, 30];

/**
 * Frames to raster for one silent material-v1 cycle.
 * 30 fps visits every frame. 15 and 10 fps keep the same 8 seconds by
 * sampling every second or third frame. Nothing here is an audio clock.
 */
export function planSilentLoop({sampleFps, durationInFrames = MATERIAL_FRAMES, timelineFps = MATERIAL_FPS} = {}) {
  if (!LOOP_SAMPLE_RATES.includes(sampleFps)) throw new Error('Choose a silent loop rate of 10, 15, or 30 fps.');
  if (durationInFrames !== MATERIAL_FRAMES || timelineFps !== MATERIAL_FPS) {
    throw new Error('Silent loop export follows the material-v1 30 fps, 240 frame loop.');
  }
  const step = timelineFps / sampleFps;
  if (!Number.isInteger(step) || durationInFrames % step !== 0) throw new Error('Sample rate must stay on the material frame grid.');
  const frameCount = durationInFrames / step;
  const frames = Array.from({length: frameCount}, (_, index) => index * step);
  const durationSeconds = frameCount / sampleFps;
  if (durationSeconds !== MATERIAL_FRAMES / MATERIAL_FPS) throw new Error('Silent loop must stay an 8 second material cycle.');
  return {audio: 'none', timelineFps, sampleFps, durationInFrames, step, frameCount, frames, durationSeconds};
}
