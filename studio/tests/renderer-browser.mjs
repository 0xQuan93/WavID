// Optional browser measurement. Start Vite and isolated Chromium with a CDP port.
// STUDIO_URL=http://127.0.0.1:18993 CDP_PORT=19226 node tests/renderer-browser.mjs
import assert from 'node:assert/strict';
const origin = process.env.STUDIO_URL || 'http://127.0.0.1:18993';
const endpoint = `http://127.0.0.1:${process.env.CDP_PORT || 19226}`;
const target = await (await fetch(`${endpoint}/json/new?${encodeURIComponent(`${origin}/fixtures/index.json`)}`, {method:'PUT'})).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject) => {socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', ({data}) => {
  const message = JSON.parse(data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);clearTimeout(request.timer);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
const send = (method,params = {}) => new Promise((resolve,reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => {pending.delete(id);reject(new Error(`Timeout: ${method}`));},30000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
  return result.result.value;
};
async function until(expression) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve,40));
  }
  throw new Error(`Condition did not become true: ${expression}`);
}
try {
  await send('Page.enable');
  await evaluate(`import('/tests/renderer-browser-harness.tsx')`);
  await until(`window.rendererProbe?.frame === 88 && !rendererProbe.busy`);
  const initialFingerprint = await evaluate('rendererProbe.fingerprint');
  const performanceResult = await evaluate(`(async () => {
    const sample = async mode => {
      const gaps = [];let last = performance.now();
      const heartbeat = setInterval(() => {const now=performance.now();gaps.push(now-last);last=now;}, 10);
      const started = performance.now();
      for (const frame of [89,90,91,92,93]) {
        rendererProbe.requestedAt = performance.now();
        if (mode === 'worker') {
          rendererProbe.setFrame(frame);
          await new Promise(resolve => {const poll=setInterval(() => {
            if (rendererProbe.frame === frame && !rendererProbe.busy) {clearInterval(poll);resolve();}
          }, 10);});
        } else {
          rendererProbe.syncFrame(frame);
          await new Promise(resolve => setTimeout(resolve,15));
        }
      }
      await new Promise(resolve => setTimeout(resolve,30));clearInterval(heartbeat);
      gaps.sort((a,b)=>a-b);
      return {durationMs:performance.now()-started,heartbeatMaxMs:Math.max(...gaps),
        heartbeatP95Ms:gaps[Math.floor(gaps.length*.95)],heartbeatSamples:gaps.length};
    };
    return {worker:await sample('worker'),synchronous:await sample('synchronous')};
  })()`);
  // Many seeks must converge on the latest request with the committed SVG agreeing.
  await evaluate(`for (let frame=100;frame<180;frame++) rendererProbe.setFrame(frame)`);
  await until(`rendererProbe.frame === 179 && !rendererProbe.busy`);
  assert.equal(await evaluate(`document.querySelector('svg').dataset.frame`),'179');
  // Switching identity during an active calculation must never retain that artwork.
  await evaluate(`rendererProbe.setFrame(180)`);
  await until(`rendererProbe.busy`);
  await evaluate(`rendererProbe.setArtist(1)`);
  await until(`rendererProbe.fingerprint && rendererProbe.fingerprint !== ${JSON.stringify(initialFingerprint)} && !rendererProbe.busy`);
  assert.equal(await evaluate(`document.querySelector('svg').dataset.fingerprint === rendererProbe.fingerprint`),true);
  // Disabling preparation while working cancels the worker; no delayed commit.
  await evaluate(`rendererProbe.setFrame(181)`);
  await until(`rendererProbe.busy`);
  await evaluate(`rendererProbe.setEnabled(false)`);
  await until(`!rendererProbe.busy`);
  const stoppedCount = await evaluate('rendererProbe.commits.length');
  await new Promise(resolve => setTimeout(resolve,500));
  assert.equal(await evaluate('rendererProbe.commits.length'),stoppedCount);
  await evaluate(`rendererProbe.setEnabled(true)`);
  await until(`rendererProbe.frame === 181 && !rendererProbe.busy`);
  // Drive the browser visibility event deterministically: work is cancelled even
  // if the host continues requesting frames, then resumes at the latest request.
  await evaluate(`rendererProbe.setFrame(182)`);
  await until(`rendererProbe.busy`);
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'))`);
  await until(`!rendererProbe.busy`);
  const hiddenCount = await evaluate('rendererProbe.commits.length');
  await evaluate(`rendererProbe.setFrame(183)`);
  await new Promise(resolve => setTimeout(resolve,500));
  assert.equal(await evaluate('rendererProbe.commits.length'),hiddenCount);
  await evaluate(`delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))`);
  await until(`rendererProbe.frame === 183 && !rendererProbe.busy`);
  assert.equal(await evaluate('rendererProbe.error'),undefined);
  console.log(JSON.stringify({ok:true,performance:performanceResult,note:'Headless Chromium CPU timing; SVG painting and physical mobile performance remain device-dependent.'},null,2));
} finally {
  socket.close();
  await fetch(`${endpoint}/json/close/${target.id}`);
}
