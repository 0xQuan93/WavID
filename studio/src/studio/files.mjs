import { canonicalSha256 } from '../core/index.mjs';

export const filenameFor = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'artist';
export function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function rasterize(svg, size = 1080) {
  if (![1080, 2160].includes(size)) throw new Error('Unsupported still size.');
  const node = svg.cloneNode(true);
  node.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  node.setAttribute('width', String(size)); node.setAttribute('height', String(size));
  node.style.width = `${size}px`; node.style.height = `${size}px`;
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(node)], {type:'image/svg+xml;charset=utf-8'}));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The browser took too long to prepare the still.')), 15000);
      image.onload = () => {clearTimeout(timeout);resolve();};
      image.onerror = () => {clearTimeout(timeout);reject(new Error('This browser could not rasterize the artwork.'));};
      image.src = url;
    });
    const canvas = document.createElement('canvas');canvas.width=canvas.height=size;
    const context=canvas.getContext('2d');
    if (!context) throw new Error('Canvas export is unavailable in this browser.');
    context.drawImage(image,0,0,size,size);
    const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if (!blob) throw new Error('PNG encoding is unavailable.');
    return blob;
  } finally {URL.revokeObjectURL(url);}
}

export async function createArtifactReceipt({png, portable, frame, size, filename, createdAt = new Date().toISOString()}) {
  if (!Number.isInteger(frame) || frame<0 || frame>239 || ![1080,2160].includes(size)) throw new Error('Invalid artifact frame or size.');
  const bytes=new Uint8Array(await png.arrayBuffer());
  const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<33 || header.getUint32(0)!==0x89504e47 || header.getUint32(4)!==0x0d0a1a0a || header.getUint32(12)!==0x49484452 || header.getUint32(16)!==size || header.getUint32(20)!==size)throw new Error('PNG dimensions do not match the artifact receipt.');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const sha256=Array.from(digest, byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase();
  const receipt={
    schema:'wavid-browser-artifact/1.0',createdAt,
    artistKey:portable.artist.artistKey,
    artifact:{filename,mimeType:'image/png',bytes:bytes.length,sha256,width:size,height:size},
    checkpoint:{sourceSha256:portable.sourceSha256,propsSha256:portable.definitionSha256,envelopeSha256:portable.envelopeSha256,materialSha256:portable.definition.props.anatomy.fingerprint,observedAt:portable.checkpoint.checkedAt},
    renderer:{id:'wavid-browser-svg',version:'0.2.0',mapping:'wavewarz-roster-to-material-v1/1.0.0',frame,fps:30},
    claims:{kind:'unsigned-artifact-receipt',signatureVerified:false,artistControlProven:false,profilePublished:false},
  };
  return {...receipt,receiptSha256:canonicalSha256(receipt)};
}

// ZIP store format. No compression library, timestamps or platform file paths.
const encoder=new TextEncoder();
export function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
export async function createZip(entries) {
  if(!Array.isArray(entries)||entries.length<1||entries.length>8)throw new Error('Invalid identity kit.');
  const locals=[],central=[];let offset=0,centralSize=0;
  for(const {name,data} of entries){
    if(!/^[a-zA-Z0-9_.-]{1,120}$/.test(name)||name==='.'||name==='..')throw new Error('Invalid kit filename.');
    const filename=encoder.encode(name);
    const bytes=typeof data==='string'?encoder.encode(data):new Uint8Array(await data.arrayBuffer());
    if(bytes.length>32_000_000)throw new Error('Identity kit artifact is too large.');
    const crc=crc32(bytes);
    const local=new Uint8Array(30+filename.length);const lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);
    lv.setUint16(12,33,true);lv.setUint32(14,crc,true);lv.setUint32(18,bytes.length,true);lv.setUint32(22,bytes.length,true);lv.setUint16(26,filename.length,true);local.set(filename,30);
    const header=new Uint8Array(46+filename.length);const cv=new DataView(header.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(14,33,true);
    cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);header.set(filename,46);
    locals.push(local,bytes);central.push(header);offset+=local.length+bytes.length;centralSize+=header.length;
  }
  const end=new Uint8Array(22);const ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  return new Blob([...locals,...central,end],{type:'application/zip'});
}
