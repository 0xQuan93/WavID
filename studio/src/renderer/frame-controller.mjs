/** One running calculation and one replaceable pending request. No frame cache. */
export function createFrameController({createWorker, props, onFrame, onError}) {
  let worker = null;
  let running = null;
  let pending = null;
  let sequence = 0;
  let disposed = false;
  const stop = () => {
    disposed = true;
    pending = null;
    running = null;
    worker?.terminate();
    worker = null;
  };
  const fail = error => {
    if (disposed) return;
    stop();
    onError(error instanceof Error ? error : new Error('Waveform preparation failed.'));
  };
  const dispatch = frame => {
    running = {id: ++sequence, frame};
    try {
      if (!worker) {
        worker = createWorker();
        worker.onmessage = ({data}) => {
          if (disposed || !running || data.id !== running.id) return;
          if (data.error) { fail(new Error(data.error)); return; }
          const completed = running;
          running = null;
          onFrame({props, frame: completed.frame, traces: data.traces});
          if (!disposed && pending !== null) {
            const next = pending;
            pending = null;
            if (next !== completed.frame) dispatch(next);
          }
        };
        worker.onerror = () => fail(new Error('The waveform worker could not start. Reload to try again.'));
        worker.onmessageerror = () => fail(new Error('The waveform worker returned unreadable data.'));
        worker.postMessage({...running, props});
      } else worker.postMessage(running);
    } catch (error) { fail(error); }
  };
  return {
    request(frame) {
      if (disposed) return;
      if (!Number.isFinite(frame)) { fail(new Error('Waveform frame must be finite.')); return; }
      if (running) pending = frame;
      else dispatch(frame);
    },
    dispose: stop,
  };
}
