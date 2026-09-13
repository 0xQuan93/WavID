// Isolated test harness served by Vite; never included in the studio build.
import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WavIdRenderer, usePreparedWavIdFrame} from '../src/renderer';
import {prepareMaterialFrame} from '../src/renderer/material';

const fixtures = await Promise.all(['oxquan', 'godcloud'].map(async artist =>
  (await (await fetch(`/fixtures/${artist}.json`)).json()).expected.props));
const probe: any = {commits: [], requestedAt: 0};
(window as any).rendererProbe = probe;
function Probe() {
  const [artist, setArtist] = useState(0);
  const [frame, setFrame] = useState(88);
  const [enabled, setEnabled] = useState(true);
  const {prepared, busy, error} = usePreparedWavIdFrame(fixtures[artist], frame, {enabled});
  Object.assign(probe, {setFrame, setArtist, setEnabled, busy, error: error?.message,
    frame: prepared?.frame, fingerprint: prepared?.props.anatomy.fingerprint});
  useEffect(() => {
    if (prepared) probe.commits.push({frame: prepared.frame, at: performance.now(),
      elapsed: performance.now() - probe.requestedAt});
  }, [prepared]);
  return <><button onClick={() => {probe.clicks = (probe.clicks || 0) + 1;}}>Respond</button>
    <div style={{width: 360, height: 360}}>{prepared && <WavIdRenderer props={prepared.props}
      frame={prepared.frame} preparedFrame={prepared}/>}</div></>;
}
document.body.innerHTML = '<div id="renderer-probe"></div>';
createRoot(document.getElementById('renderer-probe')!).render(<Probe/>);
probe.syncFrame = (frame: number) => prepareMaterialFrame(fixtures[0], frame, 240);
