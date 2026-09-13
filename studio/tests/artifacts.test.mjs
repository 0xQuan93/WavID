import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {crc32,createZip,createArtifactReceipt} from '../src/studio/files.mjs';
import {createPortableExport,canonicalSha256} from '../src/core/index.mjs';

test('ZIP records contain UTF-8 filenames, valid CRCs and matching central offsets',async()=>{
  assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
  const entries=[{name:'identity.json',data:'{"artist":"波形"}'},{name:'artwork.png',data:new Blob([new Uint8Array([1,2,3,4])])}];
  const zip=new Uint8Array(await (await createZip(entries)).arrayBuffer());
  const view=new DataView(zip.buffer);let offset=0;const offsets=[];
  for(const entry of entries){
    offsets.push(offset);assert.equal(view.getUint32(offset,true),0x04034b50);
    const nameLength=view.getUint16(offset+26,true),size=view.getUint32(offset+18,true);
    assert.equal(new TextDecoder().decode(zip.slice(offset+30,offset+30+nameLength)),entry.name);
    const body=zip.slice(offset+30+nameLength,offset+30+nameLength+size);
    assert.equal(crc32(body),view.getUint32(offset+14,true));offset+=30+nameLength+size;
  }
  const centralStart=offset;
  for(const expected of offsets){assert.equal(view.getUint32(offset,true),0x02014b50);assert.equal(view.getUint32(offset+42,true),expected);offset+=46+view.getUint16(offset+28,true);}
  assert.equal(view.getUint32(offset,true),0x06054b50);assert.equal(view.getUint32(offset+16,true),centralStart);assert.equal(view.getUint16(offset+10,true),2);
  await assert.rejects(()=>createZip([{name:'../escape',data:'x'}]),/filename/);
});

test('artifact receipt binds actual bytes, source, props and frame without claiming authority',async()=>{
  const fixture=JSON.parse(await readFile(new URL('../public/fixtures/oxquan.json',import.meta.url),'utf8'));
  const portable=createPortableExport(fixture.source.artist,{checkedAt:fixture.source.rosterCheckedAt,rosterSnapshotSha256:fixture.source.rosterSnapshotSha256,sources:fixture.source.sources});
  // Header fixture exercises byte/dimension binding; real encoded PNG is covered by browser acceptance.
  const bytes=new Uint8Array(33),view=new DataView(bytes.buffer);
  view.setUint32(0,0x89504e47);view.setUint32(4,0x0d0a1a0a);view.setUint32(8,13);view.setUint32(12,0x49484452);view.setUint32(16,1080);view.setUint32(20,1080);
  const options={png:new Blob([bytes],{type:'image/png'}),portable,frame:88,size:1080,filename:'artwork.png',createdAt:'2026-09-13T08:00:00.000Z'};
  const receipt=await createArtifactReceipt(options);
  assert.equal(receipt.artifact.sha256,createHash('sha256').update(bytes).digest('hex').toUpperCase());
  assert.equal(receipt.checkpoint.sourceSha256,portable.sourceSha256);assert.equal(receipt.renderer.frame,88);
  assert.equal(receipt.claims.signatureVerified,false);assert.equal(receipt.claims.artistControlProven,false);
  const {receiptSha256,...unsigned}=receipt;assert.equal(receiptSha256,canonicalSha256(unsigned));
  await assert.rejects(()=>createArtifactReceipt({...options,size:2160}),/dimensions/);
});
