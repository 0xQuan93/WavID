import { drawSvgToCanvas } from '../studio/files.mjs';
import { renderWaveLayer } from './wave-code.mjs';

function fitText(ctx, text, maxWidth) {
  const value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) return value;
  let clipped = value;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
  return `${clipped}…`;
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  for (const char of String(text || '')) {
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
      if (lines.length === maxLines) return lines;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function paintWave(ctx, region, handle) {
  const layer = renderWaveLayer(region.width, handle);
  const surface = document.createElement('canvas');
  surface.width = layer.width;
  surface.height = layer.height;
  const offscreen = surface.getContext('2d');
  if (!offscreen) throw new Error('Canvas export is unavailable in this browser.');
  offscreen.putImageData(new ImageData(layer.data, layer.width, layer.height), 0, 0);
  ctx.drawImage(surface, region.x, region.y);
}

export function paintCardFace(ctx, spec, artCanvas) {
  if (!spec?.ok) throw new Error(spec?.reason || 'This artist cannot be printed as a WavID card.');
  const { width, height, regions } = spec;
  ctx.fillStyle = '#0b1110';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#b5edc8';
  ctx.fillRect(regions.header.x, regions.header.y + 28, 42, 4);
  ctx.font = '600 22px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('WAVID', regions.header.x + 54, regions.header.y + 36);
  ctx.fillStyle = '#8c9d94';
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillText('CARD', regions.header.x + 148, regions.header.y + 34);

  ctx.drawImage(artCanvas, regions.art.x, regions.art.y, regions.art.width, regions.art.height);
  ctx.strokeStyle = '#34413a';
  ctx.lineWidth = 2;
  ctx.strokeRect(regions.art.x + 1, regions.art.y + 1, regions.art.width - 2, regions.art.height - 2);

  ctx.fillStyle = '#d8e2d9';
  ctx.font = '500 40px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(fitText(ctx, spec.displayName, regions.title.width), regions.title.x, regions.title.y + 40);
  ctx.fillStyle = '#b5edc8';
  ctx.font = '22px ui-monospace, monospace';
  ctx.fillText(fitText(ctx, spec.handle, regions.title.width), regions.title.x, regions.title.y + 74);

  paintWave(ctx, regions.art, spec.handle);

  ctx.fillStyle = '#8c9d94';
  ctx.font = '18px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('The artwork carries the link', regions.caption.x, regions.caption.y + 22);
  ctx.font = '15px ui-monospace, monospace';
  const lines = wrapText(ctx, spec.payload, regions.caption.width, 2);
  lines.forEach((line, index) => ctx.fillText(line, regions.caption.x, regions.caption.y + 48 + index * 20));
}

export async function renderCardPng({ svg, spec }) {
  if (!spec?.ok) throw new Error(spec?.reason || 'This artist cannot be printed as a WavID card.');
  const art = await drawSvgToCanvas(svg, 1080);
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas export is unavailable in this browser.');
  paintCardFace(ctx, spec, art);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding is unavailable.');
  return blob;
}
