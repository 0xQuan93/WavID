import qrcode from 'qrcode/lib/core/qrcode.js';
import jsQR from 'jsqr';
import { CARD_QR_LEVEL } from './payload.mjs';

export { CARD_QR_LEVEL };

export function encodeQrMatrix(text, { errorCorrectionLevel = CARD_QR_LEVEL } = {}) {
  if (typeof text !== 'string' || text.length < 1 || text.length > 512) {
    throw new Error('Card QR payload must be 1–512 characters.');
  }
  const symbol = qrcode.create(text, { errorCorrectionLevel });
  const size = symbol.modules.size;
  const modules = Array.from({ length: size }, (_, row) => (
    Array.from({ length: size }, (_, col) => (symbol.modules.get(row, col) ? 1 : 0))
  ));
  return { size, modules, errorCorrectionLevel, text };
}

export function qrMatrixToImageData(matrix, { modulePx = 8, quiet = 4 } = {}) {
  if (!matrix?.size || !Array.isArray(matrix.modules)) throw new Error('QR matrix is incomplete.');
  const cells = matrix.size + quiet * 2;
  const width = cells * modulePx;
  const data = new Uint8ClampedArray(width * width * 4);
  data.fill(255);
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.modules[row][col]) continue;
      for (let py = 0; py < modulePx; py += 1) {
        const y = (row + quiet) * modulePx + py;
        for (let px = 0; px < modulePx; px += 1) {
          const x = (col + quiet) * modulePx + px;
          const index = (y * width + x) * 4;
          data[index] = 11;
          data[index + 1] = 17;
          data[index + 2] = 16;
          data[index + 3] = 255;
        }
      }
    }
  }
  return { data, width, height: width };
}

export function decodeQrImageData(data, width, height) {
  if (!data || !width || !height) return null;
  const code = jsQR(data, width, height, { inversionAttempts: 'dontInvert' });
  return typeof code?.data === 'string' && code.data ? code.data : null;
}

export function qrMatrixToSvg(matrix, { module = 8, quiet = 4 } = {}) {
  const cells = matrix.size + quiet * 2;
  const size = cells * module;
  let marks = '';
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.modules[row][col]) continue;
      const x = (col + quiet) * module;
      const y = (row + quiet) * module;
      marks += `<rect x="${x}" y="${y}" width="${module}" height="${module}"/>`;
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img"><rect width="100%" height="100%" fill="#ffffff"/><g fill="#0b1110">${marks}</g></svg>\n`;
}
