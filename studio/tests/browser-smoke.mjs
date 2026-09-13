// Real-browser acceptance check. Start Chromium with --remote-debugging-port=19223.
// No browser automation dependency is installed; this uses Chromium's debug protocol.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {canonicalSha256, parsePortableExport} from '../src/core/index.mjs';
const origin = process.env.STUDIO_URL || 'http://127.0.0.1:18990/';
// A fresh default prevents a previous run's downloads from satisfying this run.
// If STUDIO_ARTIFACTS is supplied, use a fresh directory there too.
const artifactDir = process.env.STUDIO_ARTIFACTS || await mkdtemp(path.join(tmpdir(),'wavid-studio-acceptance-'));
await mkdir(artifactDir, { recursive: true });
const targets = await (await fetch('http://127.0.0.1:19223/json')).json();
const target = targets.find((entry) => entry.type === 'page');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 0;
const pending = new Map();
const exceptions = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject, timeout } = pending.get(message.id);pending.delete(message.id);clearTimeout(timeout);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => {pending.delete(id);reject(new Error(`Timed out: ${method}`));}, 30000);
    pending.set(id, { resolve, reject, timeout });socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
  return result.result.value;
}
async function until(expression, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Browser condition not met: ${expression}`);
}
async function screenshot(name) {
  const result = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
  await writeFile(path.join(artifactDir,name), Buffer.from(result.data,'base64'));
}
async function downloaded(predicate) {
  let previous;
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const files = await readdir(artifactDir);
    const name = files.find(predicate);
    if (name && !files.some(file => file.endsWith('.crdownload'))) {
      const {size} = await stat(path.join(artifactDir,name));
      if (size > 0 && previous?.name === name && previous.size === size) return name;
      previous = {name,size};
    }
    await new Promise(resolve => setTimeout(resolve,200));
  }
  throw new Error('Expected download did not complete.');
}
async function press(key, code = key, extra = {}) {
  await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,...extra});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,...extra});
}
// Inspect the bytes downloaded by Chromium, independently of the ZIP writer.
function storedZipMembers(bytes) {
  const entries = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset+8),0,'Identity kit uses ZIP store format');
    const size=bytes.readUInt32LE(offset+18), nameLength=bytes.readUInt16LE(offset+26), extraLength=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+nameLength).toString('utf8');
    const start=offset+30+nameLength+extraLength;
    assert.ok(start+size<=bytes.length,'ZIP member is complete');
    assert.equal(entries.has(name),false,'ZIP member names are unique');
    entries.set(name,bytes.subarray(start,start+size));
    offset=start+size;
  }
  assert.equal(bytes.readUInt32LE(offset),0x02014b50,'ZIP central directory exists');
  assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50,'ZIP download is complete');
  assert.equal(bytes.readUInt16LE(bytes.length-12),entries.size,'ZIP member count agrees');
  return entries;
}
try {
  await send('Runtime.enable');await send('Page.enable');
  await send('Browser.setDownloadBehavior', {behavior:'allow',downloadPath:artifactDir});
  await send('Emulation.setDeviceMetricsOverride', {width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate', {url:origin});
  await until(`document.querySelector('.preview-stage svg[data-fingerprint]') && document.querySelectorAll('.artist-row').length === 4`);
  assert.match(await evaluate(`document.querySelector('h2').textContent`), /OxQuan/);
  assert.equal(await evaluate(`document.querySelector('.preview-stage svg[data-fingerprint]').getAttribute('data-frame')`), '88');
  const initialFingerprint = await evaluate(`document.querySelector('.preview-stage svg[data-fingerprint]').dataset.fingerprint`);
  const initialPaths = await evaluate(`document.querySelectorAll('.preview-stage path').length`);
  assert.ok(initialPaths > 100, `Expected real material traces, got ${initialPaths}`);
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
  await screenshot('desktop.png');
  await evaluate(`document.querySelector('[aria-label="Enter focus view"]').click()`);
  assert.equal(await evaluate(`document.querySelector('.wavid-studio').dataset.focus`),'true');
  await evaluate(`document.querySelector('[aria-label="Exit focus view"]').click()`);

  await evaluate(`document.querySelector('[aria-label="Find an artist"]').focus()`);
  await send('Input.insertText',{text:'godcloud'});
  await until(`document.querySelectorAll('.artist-row').length===1`);
  assert.match(await evaluate(`document.querySelector('.artist-row').textContent`),/GodclouD/);
  assert.equal(await evaluate(`document.querySelector('.preview-stage svg[data-fingerprint]').dataset.fingerprint`),initialFingerprint,'Searching preserves the selected artwork');
  await evaluate(`const search=document.querySelector('[aria-label="Find an artist"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'');
    search.dispatchEvent(new Event('input',{bubbles:true}))`);
  await until(`document.querySelectorAll('.artist-row').length===4`);

  // Block only the public API; failed refresh must preserve all usable local work.
  await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['*wavewarz.info/api/public/*']});
  await evaluate(`document.querySelector('.roster-bottom .outline-button').click()`);
  await until(`!!document.querySelector('.error') && !document.querySelector('.roster-bottom .outline-button').disabled`);
  assert.equal(await evaluate(`document.querySelectorAll('.artist-row').length`),4);
  assert.equal(await evaluate(`document.querySelector('.preview-stage svg[data-fingerprint]').dataset.fingerprint`),initialFingerprint,'Failed refresh preserves the current artwork');
  await send('Network.setBlockedURLs',{urls:[]});

  await evaluate(`document.querySelector('[data-tab="anatomy"]').focus()`);
  await press('ArrowRight');
  await until(`document.activeElement?.dataset.tab==='history' && document.activeElement.getAttribute('aria-selected')==='true'`);
  assert.ok(await evaluate(`!!document.querySelector('.history-detail')`));
  await press('End');
  await until(`document.activeElement?.dataset.tab==='source' && document.activeElement.getAttribute('aria-selected')==='true'`);
  await press('Home');
  await until(`document.activeElement?.dataset.tab==='anatomy' && document.activeElement.getAttribute('aria-selected')==='true'`);
  assert.equal(await evaluate(`document.querySelectorAll('[role="tab"][tabindex="0"]').length`),1);

  await evaluate(`document.querySelectorAll('.artist-row')[1].click()`);
  await until(`document.querySelector('.preview-stage svg[data-fingerprint]')?.dataset.fingerprint !== ${JSON.stringify(initialFingerprint)} && !!document.querySelector('.preview-stage svg[data-fingerprint]')`);
  assert.match(await evaluate(`document.querySelector('h2').textContent`), /GodclouD/);
  await evaluate(`document.querySelector('[data-tab="source"]').click()`);
  await until(`document.querySelector('.provenance')?.textContent.includes('wavewarz:audius:godcloud')`);
  await evaluate(`document.querySelectorAll('.artist-row')[0].click();document.querySelector('[data-tab="anatomy"]').click()`);
  await until(`document.querySelector('.preview-stage svg[data-fingerprint]')?.dataset.fingerprint === ${JSON.stringify(initialFingerprint)}`);
  await evaluate(`document.querySelector('[aria-label="Play animation"]').click()`);
  await until(`document.querySelector('.preview-stage svg[data-fingerprint]')?.dataset.frame !== '88'`);
  await evaluate(`document.querySelector('[aria-label="Pause animation"]').click()`);
  await until(`!document.querySelector('.preview-status')?.textContent.includes('Preparing')`);
  const frozenFrame = await evaluate(`document.querySelector('.preview-stage svg[data-fingerprint]').dataset.frame`);
  await new Promise((resolve)=>setTimeout(resolve,600));
  assert.equal(await evaluate(`document.querySelector('.preview-stage svg[data-fingerprint]').dataset.frame`), frozenFrame);
  await evaluate(`document.querySelector('.export-panel .outline-button').click()`);
  await evaluate(`document.querySelector('.primary-button').click()`);
  await until(`document.querySelector('.notice')?.textContent.includes('still downloaded')`);
  const jsonName = await downloaded(file=>file.endsWith('-wavid.json'));
  const pngName = await downloaded(file=>file.includes('-wavid-frame-') && file.endsWith('.png'));
  const exported = JSON.parse(await readFile(path.join(artifactDir,jsonName),'utf8'));
  assert.equal(exported.schema,'wavid-browser-export/1.0');
  assert.equal(exported.artist.artistKey,'wavewarz:audius:_0xquan');
  const png = await readFile(path.join(artifactDir,pngName));
  assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),1080);
  await evaluate(`document.querySelector('.kit-button').click()`);
  await until(`document.querySelector('.export-dialog').open`);
  await evaluate(`const size=document.querySelector('.export-dialog select');size.value='2160';size.dispatchEvent(new Event('change',{bubbles:true}))`);
  await screenshot('export-kit.png');
  await evaluate(`document.querySelector('.export-dialog .primary-button').click()`);
  await until(`document.querySelector('.notice')?.textContent.includes('Identity kit downloaded')`);
  const kitName=await downloaded(file=>file.endsWith('-wavid-kit.zip'));
  const members=storedZipMembers(await readFile(path.join(artifactDir,kitName)));
  assert.equal(members.size,4);
  const receipt=JSON.parse(members.get('receipt.json').toString('utf8'));
  const kitIdentity=JSON.parse(members.get('identity.json').toString('utf8'));
  const kitPng=members.get(receipt.artifact.filename);
  assert.ok(kitPng,'Receipt names the included PNG');
  assert.equal(kitPng.readUInt32BE(16),2160);assert.equal(kitPng.readUInt32BE(20),2160);
  assert.equal(receipt.artifact.width,2160);assert.equal(receipt.artifact.height,2160);
  assert.equal(receipt.artifact.bytes,kitPng.length);
  assert.equal(receipt.artifact.sha256,createHash('sha256').update(kitPng).digest('hex').toUpperCase(),'Receipt commits to the exact downloaded artwork bytes');
  const {receiptSha256,...receiptBody}=receipt;
  assert.equal(receiptSha256,canonicalSha256(receiptBody));
  assert.equal(receipt.checkpoint.envelopeSha256,kitIdentity.envelopeSha256);
  assert.equal(receipt.checkpoint.sourceSha256,kitIdentity.sourceSha256);
  assert.equal(receipt.checkpoint.propsSha256,kitIdentity.definitionSha256);
  assert.equal(receipt.renderer.frame,Number(frozenFrame));
  assert.equal(receipt.claims.artistControlProven,false);
  assert.equal(parsePortableExport(kitIdentity).artist.artistKey,exported.artist.artistKey);
  assert.ok(members.has('READ-ME.txt'));
  await evaluate(`document.querySelector('[data-tab="history"]').click()`);
  await until(`!!document.querySelector('.history-detail .outline-button')`);
  await evaluate(`document.querySelector('.history-detail .outline-button').click()`);
  await until(`document.querySelector('.notice')?.textContent.includes('Checkpoint held')`);
  const doc = await send('DOM.getDocument');
  const input = await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(artifactDir,jsonName)]});
  await until(`document.querySelector('.collection-label').textContent.includes('IMPORTED') && !!document.querySelector('.preview-stage svg[data-fingerprint]')`);
  assert.equal(await evaluate(`document.querySelector('.preview-stage svg[data-fingerprint]').dataset.fingerprint`),initialFingerprint);
  await evaluate(`document.querySelector('[data-tab="history"]').click()`);
  await until(`document.querySelector('.comparison')?.textContent.includes('same source history')`);
  // Corrupt a portable identity and verify the existing preview is retained.
  const corrupted=structuredClone(exported);corrupted.artist.displayName='Tampered identity';
  await writeFile(path.join(artifactDir,'invalid-definition.json'),JSON.stringify(corrupted));
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(artifactDir,'invalid-definition.json')]});
  await until(`/fingerprint|integrity/i.test(document.querySelector('.error')?.textContent || '')`);
  assert.equal(await evaluate(`document.querySelector('.preview-stage svg[data-fingerprint]').dataset.fingerprint`),initialFingerprint);
  // Return to default collection and exercise touch-width layout.
  await send('Page.navigate',{url:origin});
  await until(`document.querySelectorAll('.artist-row').length === 4 && !!document.querySelector('.preview-stage svg[data-fingerprint]')`);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),true);
  await screenshot('mobile.png');
  await evaluate(`document.querySelector('.workspace').scrollIntoView()`);
  await screenshot('mobile-preview.png');
  if (process.env.STUDIO_LIVE_CHECK === '1') {
    await evaluate(`document.querySelector('.roster-bottom .outline-button').click()`);
    await until(`document.querySelector('.collection-label')?.textContent.includes('WAVEWARZ SNAPSHOT')`,30000);
    await until(`!!document.querySelector('.preview-stage svg[data-fingerprint]')`);
    const count=await evaluate(`document.querySelectorAll('.artist-row').length`);
    assert.ok(count>4,'Live roster should replace four frozen artists');
    console.log(`Live roster loaded: ${count} artists. Coverage remains leaderboard-bounded.`);
  }
  assert.deepEqual(exceptions,[],'No uncaught browser exceptions');
  console.log(JSON.stringify({ok:true,initialPaths,initialFingerprint,pngBytes:png.length,kitPngBytes:kitPng.length,kitPngSha256:receipt.artifact.sha256,kitResolution:2160,checks:['search','keyboard tabs','failed refresh preserves collection','checkpoint re-import comparison','exact ZIP receipt commitments'],downloads:[jsonName,pngName,kitName],artifacts:artifactDir},null,2));
} finally {
  await send('Network.setBlockedURLs',{urls:[]}).catch(()=>{});
  socket.close();
}
