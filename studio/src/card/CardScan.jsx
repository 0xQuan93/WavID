import React, { useEffect, useRef, useState } from 'react';
import { decodeCardPayload } from './payload.mjs';
import { decodeQrImageData } from './qr.mjs';

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

async function readFrame(video, canvas, detector) {
  if (detector) {
    try {
      const codes = await detector.detect(video);
      const value = codes?.find((code) => typeof code?.rawValue === 'string' && code.rawValue)?.rawValue;
      if (value) return value;
    } catch {
      // Fall through to the software decoder when the platform detector misses a frame.
    }
  }
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  return decodeQrImageData(image.data, width, height);
}

const PHASE_COPY = {
  starting: 'Starting the camera…',
  live: 'Point the camera at a WavID card QR.',
  insecure: 'Camera scanning needs HTTPS or localhost. Paste the card link below, or let the phone’s camera app open the printed QR.',
  denied: 'Camera permission was blocked. Allow camera access, or paste the card link below.',
  missing: 'No camera is available. Paste the card link below.',
  unsupported: 'This browser cannot open a camera. Paste the card link below.',
  error: 'The camera could not be opened. Paste the card link below.',
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
        if (!busy && now - last > 180) {
          busy = true;
          last = now;
          try {
            const text = await readFrame(video, canvas, detector);
            if (stopped) return;
            if (text) {
              const decoded = decodeCardPayload(text);
              if (decoded.ok) {
                stopped = true;
                stream?.getTracks().forEach((track) => track.stop());
                onResolveRef.current?.(decoded);
                return;
              }
              setMiss(decoded.reason);
            }
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

  return <div className="wavid-card">
    <header className="card-top">
      <div>
        <span className="eyebrow">WAVID CARD</span>
        <h1>Scan the card.</h1>
      </div>
      {onStudio && <button type="button" className="text-button" onClick={onStudio}>Studio</button>}
    </header>
    <p className="card-lead">The scanner accepts only a WavID card link. It opens that card page here. It does not follow any other address printed in a code.</p>
    <div className="viewfinder">
      <video ref={videoRef} muted playsInline autoPlay />
      {phase !== 'live' && <div className="viewfinder-note"><p>{PHASE_COPY[phase]}</p></div>}
      <canvas ref={canvasRef} className="sr-only" aria-hidden="true" />
    </div>
    <p className="card-status" role="status">{phase === 'live' ? (miss || PHASE_COPY.live) : PHASE_COPY[phase]}</p>
    <form className="card-paste" onSubmit={submitManual}>
      <label htmlFor="wavid-card-link">Or paste a card link</label>
      <input id="wavid-card-link" value={manual} onChange={(event) => setManual(event.target.value)} placeholder="https://wavewarz.info/wavid/card/…" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
      <button type="submit" className="primary-button">Open card</button>
    </form>
  </div>;
}
