import { buildRosterSnapshot, canonicalSha256 } from '../core/index.mjs';

export async function loadFrozenRoster(base, signal) {
  const root=base.endsWith('/')?base:`${base}/`;
  const response=await fetch(`${root}index.json`,{signal});
  if(!response.ok)throw new Error('The example collection could not be loaded.');
  const index=await response.json();
  const fixtures=await Promise.all(index.map(async entry=>{
    if(!/^[a-z0-9-]+\.json$/.test(entry.file))throw new Error('Invalid collection entry.');
    const result=await fetch(`${root}${entry.file}`,{signal});
    if(!result.ok)throw new Error(`Could not load ${entry.name}'s checkpoint.`);
    const fixture=await result.json();
    if(canonicalSha256(fixture.source)!==fixture.birthRecord.source.canonicalSha256)throw new Error('An example checkpoint failed its integrity check.');
    return fixture;
  }));
  return {artists:fixtures.map(fixture=>fixture.source.artist),checkpoints:Object.fromEntries(fixtures.map(({source})=>[source.artist.artistKey,{checkedAt:source.rosterCheckedAt,rosterSnapshotSha256:source.rosterSnapshotSha256,sources:source.sources}]))};
}

export async function fetchPublicRoster({signal}={}) {
  const urls=['artists?limit=500','songs?sort=volume&limit=500'];
  const payloads=await Promise.all(urls.map(async endpoint=>{
    const response=await fetch(`https://wavewarz.info/api/public/leaderboards/${endpoint}`,{signal,credentials:'omit'});
    if(!response.ok)throw new Error(`WaveWarz returned ${response.status}. Your current collection is still available.`);
    const text=await response.text();
    if(text.length>8_000_000)throw new Error('The public roster response exceeded the studio limit.');
    return JSON.parse(text);
  }));
  const roster=buildRosterSnapshot({artistsPayload:payloads[0],songsPayload:payloads[1],retrievedAt:new Date().toISOString()});
  if(!roster.artists?.some(artist=>artist.eligibility.canBirth))throw new Error('No artists with reconciled song identities were found.');
  return roster;
}
