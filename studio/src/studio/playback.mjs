export const MATERIAL_FPS = 30;
export const MATERIAL_FRAMES = 240;

/** Wall-clock frame on the material timeline. One anchored start, no step drift. */
export function previewFrameAt({startFrame, elapsedMs, duration = MATERIAL_FRAMES, fps = MATERIAL_FPS} = {}) {
  if (!Number.isInteger(duration) || duration < 1 || !Number.isInteger(fps) || fps < 1) {
    throw new Error('Preview timeline is not a material loop.');
  }
  if (!Number.isInteger(startFrame) || startFrame < 0 || startFrame >= duration) {
    throw new Error('Preview start frame is outside the material loop.');
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error('Preview elapsed time must be nonnegative.');
  }
  const advanced = Math.floor(elapsedMs * fps / 1000);
  return (startFrame + advanced) % duration;
}
