import React, { useEffect, useRef, useState } from 'react';
import { decodeCardPayload } from './payload.mjs';
import { decodeQrImageData } from './qr.mjs';
import { frameSize, scanDecision } from './scan-frame.mjs';
import { decodeWaveImage } from './wave-code.mjs';

async function openQrDetector() {
  const Detector = globalThis.BarcodeDetector;
  if (typeof Detector !== 'function') return null;
  try {
    if (typeof Detector.getSupportedFormats === 'function') {
      const formats = await Detector.getSupportedFormats();
      if (!Array.isArray(formats) || !formats.includes('qr_code')) return null;
    }
    return new Detector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

async function openCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error('Camera capture is unavailable in this browser.');
    error.name = 'UnsupportedError';
    throw error;
  }
  const attempts = [
    { audio: false, video: { facingMode: { ideal: 'environment' } } },
    { audio: false, video: true },
  ];
  let lastError;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') throw error;
    }
  }
  throw lastError || new Error('No camera is available.');
}

async function loadPhoto(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('That photo could not be read.'));
    });
    image.src = url;
    return await loaded;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readCode(image, detectorText) {
  const wave = decodeWaveImage(image.data, image.width, image.height);
  let qrText = detectorText || null;
  if (!wave.ok && !qrText) {
    try {
      qrText = decodeQrImageData(image.data, image.width, image.height);
    } catch {
      qrText = null;
    }
  }
  return scanDecision({ wave, qrText });
}

async function readCameraFrame(video, canvas, detector) {
  let detectorText = null;
  if (detector) {
    try {
      const codes = await detector.detect(video);
      detectorText = codes?.find((code) => typeof code?.rawValue === 'string' && code.rawValue)?.rawValue || null;
    } catch {
      // A platform miss still leaves the artwork decoder to read the frame.
    }
  }
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return detectorText ? scanDecision({ qrText: detectorText }) : null;
  }
  const size = frameSize(video.videoWidth, video.videoHeight, 1280);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(video, 0, 0, size.width, size.height);
  return readCode(context.getImageData(0, 0, size.width, size.height), detectorText);
}

const PHASE_COPY = {
  starting: 'Starting the camera…',
  live: 'Point the camera at the WavID artwork. The image itself carries the link.',
  insecure: 'Camera scanning needs HTTPS or localhost. Use a photo of the artwork, or paste the card link below.',
  denied: 'Camera permission was blocked. Allow camera access, use a photo of the artwork, or paste the card link.',
  missing: 'No camera is available. Use a photo of the artwork, or paste the card link below.',
  unsupported: 'This browser cannot open a camera. Use a photo of the artwork, or paste the card link below.',
  error: 'The camera could not be opened. Use a photo of the artwork, or paste the card link below.',
};

export function CardScan({ onResolve, onStudio }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;
  const [phase, setPhase] = useState('starting');
  const [miss, setMiss] = useState('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    const previous = document.title;
    document.title = 'Scan a WavID card';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    let stopped = false;
    let stream = null;
    let timer = 0;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    async function run() {
      if (!window.isSecureContext) {
        setPhase('insecure');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase('unsupported');
        return;
      }
      try {
        stream = await openCameraStream();
      } catch (error) {
        if (stopped) return;
        const name = error?.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') setPhase('denied');
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setPhase('missing');
        else if (name === 'UnsupportedError') setPhase('unsupported');
        else setPhase('error');
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        if (!stopped) setPhase('error');
        return;
      }
      if (stopped) return;
      setPhase('live');
      const detector = await openQrDetector();
      let busy = false;
      let last = 0;
      const loop = async (now) => {
        if (stopped) return;
        if (!busy && now - last > 250) {
          busy = true;
          last = now;
          try {
            const decoded = await readCameraFrame(video, canvas, detector);
            if (stopped) return;
            if (decoded?.ok) {
              stopped = true;
              stream?.getTracks().forEach((track) => track.stop());
              onResolveRef.current?.(decoded);
              return;
            }
            if (decoded && decoded.code !== 'not-found') setMiss(decoded.reason);
          } catch {
            // Keep the preview running if one frame cannot be read.
          }
          busy = false;
        }
        if (!stopped) timer = requestAnimationFrame(loop);
      };
      timer = requestAnimationFrame(loop);
    }

    run();
    return () => {
      stopped = true;
      cancelAnimationFrame(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  function submitManual(event) {
    event.preventDefault();
    const decoded = decodeCardPayload(manual);
    if (!decoded.ok) {
      setMiss(decoded.reason);
      return;
    }
    onResolveRef.current?.(decoded);
  }

  async function submitPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const canvas = canvasRef.current;
    try {
      const photo = await loadPhoto(file);
      const size = frameSize(photo.width, photo.height, 1600);
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('That photo could not be read.');
      context.imageSmoothingEnabled = false;
      context.drawImage(photo, 0, 0, size.width, size.height);
      const decoded = readCode(context.getImageData(0, 0, size.width, size.height));
      if (!decoded.ok) {
        setMiss(decoded.reason);
        return;
      }
      onResolveRef.current?.(decoded);
    } catch (error) {
      setMiss(error?.message || 'That photo could not be read.');
    }
  }

  return <div className="wavid-card">
    <header className="card-top">
      <div>
        <span className="eyebrow">WAVID CARD</span>
        <h1>Scan the artwork.</h1>
      </div>
      {onStudio && <button type="button" className="text-button" onClick={onStudio}>Studio</button>}
    </header>
    <p className="card-lead">Point the camera at the WavID image. The signal is woven into the artwork. A recognized card opens here. The scanner does not follow any other address.</p>
    <div className="viewfinder">
      <video ref={videoRef} muted playsInline autoPlay />
      {phase !== 'live' && <div className="viewfinder-note"><p>{PHASE_COPY[phase]}</p></div>}
      <canvas ref={canvasRef} className="sr-only" aria-hidden="true" />
    </div>
    <p className="card-status" role="status">{phase === 'live' ? (miss || PHASE_COPY.live) : (miss || PHASE_COPY[phase])}</p>
    <label className="card-file">
      Use a photo of the artwork
      <input type="file" accept="image/*" capture="environment" onChange={submitPhoto} />
    </label>
    <form className="card-paste" onSubmit={submitManual}>
      <label htmlFor="wavid-card-link">Or paste a card link</label>
      <input id="wavid-card-link" value={manual} onChange={(event) => setManual(event.target.value)} placeholder="https://wavewarz.info/wavid/card/…" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
      <button type="submit" className="primary-button">Open card</button>
    </form>
  </div>;
}
