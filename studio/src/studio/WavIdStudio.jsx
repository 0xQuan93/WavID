import React, { Component, useEffect, useRef, useState, useMemo, useId } from 'react';
import { generateDefinition, createPortableExport, parsePortableExport, describeProvenance, compareCheckpoints } from '../core/index.mjs';
import { WavIdRenderer, usePreparedWavIdFrame } from '../renderer';
import { Icon } from './icons';
import { rasterize, createZip, createArtifactReceipt, downloadFile as download, filenameFor as slug } from './files.mjs';
import { loadFrozenRoster, fetchPublicRoster } from './roster.mjs';


const shortHash = (value = '') => `${String(value).slice(0, 12)}…${String(value).slice(-8)}`;
const number = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value) || 0);
const nameOf = (artist) => artist?.displayName || artist?.identity?.audiusHandle || 'Unknown artist';
const prettyDate = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Frozen checkpoint';

function Mark({small = false}) {
  return <svg className={small ? 'mark small' : 'mark'} viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M3 21h6l4-13 7 25 6-23 4 11h7" stroke="currentColor" strokeWidth="1.7"/><circle cx="20" cy="20" r="18" stroke="currentColor" opacity=".3"/></svg>;
}

class RenderBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <div className="render-error">This preview could not be drawn. Select another artist or reload the studio.<small>{this.state.error.message}</small></div> : this.props.children; }
}

export function WavIdStudio({ initialRoster = null, fixtureBaseUrl = './fixtures/', loadRoster, onDefinition } = {}) {
  const [roster, setRoster] = useState(initialRoster);
  const [selectedKey, setSelectedKey] = useState(initialRoster?.artists?.find(a=>a.eligibility?.canBirth)?.artistKey || '');
  const [query, setQuery] = useState('');
  const [generation, setGeneration] = useState(null);
  const [tab, setTab] = useState('anatomy');
  const [frame, setFrame] = useState(88);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(initialRoster ? '' : 'Loading frozen collection…');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sourceMode, setSourceMode] = useState(initialRoster ? 'provided' : 'frozen');
  const [focus, setFocus] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [exportSize, setExportSize] = useState(1080);
  const [readyOnly, setReadyOnly] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(0);
  const [now, setNow] = useState(Date.now());
  const dialogRef = useRef(null);
  const rootRef = useRef(null);
  const fetchRef = useRef(null);
  const instanceId = useId();
  const onDefinitionRef = useRef(onDefinition); onDefinitionRef.current = onDefinition;
  const svgRef = useRef(null);
  const fileRef = useRef(null);
  const requestSequence = useRef(0);
  const artists = roster?.artists || [];
  const artist = artists.find((entry) => entry.artistKey === selectedKey);
  // Never pair a newly selected artist with the previous observation's form.
  const definition = generation?.artist === artist && generation?.roster === roster ? generation.value : null;
  const filtered = artists.filter((entry) => (!readyOnly || entry.eligibility?.canBirth) && `${nameOf(entry)} ${entry.identity?.audiusHandle || ''}`.toLowerCase().includes(query.toLowerCase()));
  const anatomy = definition?.props?.anatomy;
  const stats = artist?.quickBattle || {};
  const rankedSongs = definition ? [...artist.songs].sort((a, b) => b.totalVolumeSol - a.totalVolumeSol || a.musicLink.localeCompare(b.musicLink)) : [];
  const checkpoint = roster?.checkpoints?.[selectedKey] || {
    rosterSnapshotSha256: roster?.snapshotSha256,
    checkedAt: roster?.checkedAt || roster?.retrievedAt,
    sources: roster?.sources,
  };

  const {prepared, busy:renderBusy, error:renderError} = usePreparedWavIdFrame(definition?.props, frame);
  const visibleFrame = prepared?.frame ?? 88;
  const evidence = useMemo(() => {if (!definition) return null;try {return describeProvenance(definition,sourceMode);} catch {return null;}}, [definition,sourceMode]);
  const comparison = useMemo(() => {if(!baseline || !definition || baseline.artist.artistKey !== artist?.artistKey) return null;try{return compareCheckpoints(baseline,createPortableExport(artist,checkpoint));}catch{return null;}},[baseline,definition,artist,roster]);
  const cooldown = Math.max(0,30-Math.floor((now-lastRefresh)/1000));
  useEffect(()=>{if(!lastRefresh||!cooldown)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[lastRefresh,cooldown]);
  useEffect(()=>()=>fetchRef.current?.abort(),[]);
  useEffect(()=>{const escape=e=>{if(e.key==='Escape')setFocus(false);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  useEffect(() => {
    if (initialRoster) return;
    let disposed = false;
    const controller = new AbortController();
    loadFrozenRoster(fixtureBaseUrl, controller.signal).then((data) => {
      if (disposed) return;
      setRoster(data);
      setSelectedKey(data.artists.find((entry) => /0xquan/i.test(nameOf(entry)))?.artistKey || data.artists[0]?.artistKey || '');
      setBusy('');
    }).catch((err) => { if (!disposed) {setError(err.message);setBusy('');} });
    return () => { disposed = true; controller.abort(); };
  }, [initialRoster,fixtureBaseUrl]);

  useEffect(() => {
    if (!artist) return;
    const sequence = ++requestSequence.current;
    setError(''); setGeneration(null); setPlaying(false); setFrame(88);
    Promise.resolve().then(() => generateDefinition(artist, checkpoint)).then((result) => {
      if (sequence === requestSequence.current) {setGeneration({artist,roster,value:result});onDefinitionRef.current?.(result);}
    }).catch((err) => { if (sequence === requestSequence.current) setError(`Could not generate this identity: ${err.message}`); });
  }, [artist, roster]);

  useEffect(() => {
    if (!playing) return;
    let timer = 0;
    let previous = performance.now();
    const tick = (now) => {
      if (now - previous >= 1000 / 15) {
        const elapsedFrames = Math.max(1, Math.round((now - previous) * 30 / 1000));
        previous = now;
        setFrame((current) => (current + elapsedFrames) % 240);
      }
      timer = requestAnimationFrame(tick);
    };
    timer = requestAnimationFrame(tick);
    const stop = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', stop);
    return () => {cancelAnimationFrame(timer);document.removeEventListener('visibilitychange', stop);};
  }, [playing]);

  async function refreshRoster() {
    if (busy || cooldown) return;
    setBusy('Reading WaveWarz…'); setError(''); setNotice('');
    try {
      const controller = new AbortController(); fetchRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), 20000);
      let data;
      try { data = await (loadRoster || fetchPublicRoster)({signal:controller.signal}); }
      finally { clearTimeout(timeout); }
      if (!data.artists?.some((entry) => entry.eligibility.canBirth)) throw new Error('No eligible artists were found in these leaderboard records.');
      if(definition) setBaseline(createPortableExport(artist,checkpoint));
      setLastRefresh(Date.now());setNow(Date.now());
      setRoster(data); setSourceMode('live'); setQuery('');
      setSelectedKey((current) => data.artists.some((entry) => entry.artistKey === current && entry.eligibility.canBirth) ? current : data.artists.find((entry) => entry.eligibility.canBirth).artistKey);
      setNotice('Public leaderboard snapshot loaded. Coverage is limited to the returned records; this is not a complete history archive.');
    } catch (err) { setError(err.name === 'AbortError' ? 'WaveWarz took too long to respond. Your current collection is still available.' : err.message); }
    finally { setBusy(''); }
  }

  async function importDefinition(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (busy) return;
    setError(''); setNotice('');
    try {
      if (file.size > 2_000_000) throw new Error('Choose a WavID definition smaller than 2 MB.');
      const imported = parsePortableExport(JSON.parse(await file.text()));
      if(definition && artist.artistKey===imported.artist.artistKey) setBaseline(createPortableExport(artist,checkpoint));
      setRoster({ artists: [imported.artist], checkedAt: imported.checkpoint.checkedAt, sources: imported.checkpoint.sources, snapshotSha256: imported.checkpoint.rosterSnapshotSha256, checkpoints: { [imported.artist.artistKey]: imported.checkpoint } });
      setSelectedKey(imported.artist.artistKey); setSourceMode('imported'); setQuery('');
      setNotice('Definition reproduced successfully. Fingerprint integrity does not verify the supplied history with WaveWarz.');
    } catch (err) { setError(`Import failed: ${err.message}`); }
  }

  function exportDefinition() {
    if (!definition) return;
    try {
      const payload = createPortableExport(artist, checkpoint);
      download(new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json' }), `${slug(nameOf(artist))}-wavid.json`);
      setNotice('Definition downloaded. Keep this file to reproduce this checkpoint.');
    } catch (err) {setError(`Could not save definition: ${err.message}`);}
  }

  async function exportPng(kit = false) {
    if (!svgRef.current || !prepared || busy) return;
    const capturedFrame=Number(svgRef.current.dataset.frame);
    setPlaying(false); setFrame(capturedFrame); setError(''); setBusy(kit?'Assembling your identity kit…':'Preparing your still…');
    dialogRef.current?.close();
    try {
      const portable=createPortableExport(artist,checkpoint);
      if(svgRef.current.dataset.fingerprint!==portable.definition.props.anatomy.fingerprint)throw new Error('Wait for this artist’s preview to finish preparing.');
      const png=await rasterize(svgRef.current,exportSize);
      const filename=`${slug(nameOf(artist))}-wavid-frame-${capturedFrame}.png`;
      if(kit) {
        const receipt=await createArtifactReceipt({png,portable,frame:capturedFrame,size:exportSize,filename});
        const archive=await createZip([{name:filename,data:png},{name:'identity.json',data:JSON.stringify(portable,null,2)+'\n'},{name:'receipt.json',data:JSON.stringify(receipt,null,2)+'\n'},{name:'READ-ME.txt',data:'WavID identity kit\n\nThe artwork is bound to identity.json by receipt.json. These unsigned SHA-256 commitments establish file integrity, not artist ownership or platform approval. Import identity.json into WavID Studio to reproduce this checkpoint. Browser rasterization can differ by device; the receipt hashes this exact PNG.\n\nWavID by OxQuan — https://github.com/0xQuan93/WavID\n'}]);
        download(archive,`${slug(nameOf(artist))}-wavid-kit.zip`);
        setNotice('Identity kit downloaded: artwork, source definition and exact-artifact receipt.');
      } else {download(png,filename);setNotice(`${exportSize} × ${exportSize} still downloaded from the displayed frame.`);}
    } catch(err) {setError(err.message);} finally {setBusy('');}
  }
  async function copyHash(value) {try{await navigator.clipboard.writeText(value);setNotice('Fingerprint copied.');}catch{setNotice(value);}}
  function rememberCheckpoint(){try{setBaseline(createPortableExport(artist,checkpoint));setNotice('Checkpoint held in this tab. Load fresh history or import another checkpoint for this artist to compare.');}catch(err){setError(err.message);}}
  function togglePlayback(){if(playing){setPlaying(false);setFrame(visibleFrame);}else{setFrame(visibleFrame);setPlaying(true);}}
  function tabKeys(event){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const values=['anatomy','history','source'];const next=event.key==='Home'?0:event.key==='End'?2:(values.indexOf(tab)+(event.key==='ArrowRight'?1:2))%3;setTab(values[next]);rootRef.current.querySelector(`[data-tab="${values[next]}"]`)?.focus();}

  return <div className="wavid-studio studio" data-focus={focus} ref={rootRef}>
    <a className="skip-link" href={`#workspace-${instanceId}`}>Skip to the waveform</a>
    <header className="topbar">
      <a className="brand" href="./" aria-label="WavID studio home"><Mark/><span>WavID<span className="brand-caption">HISTORY LEAVES FORM</span></span></a>
      <div className="top-context"><span className="status-dot"/>THE PROVENANCE INSTRUMENT <span className="version">STUDIO 0.2</span></div>
      <a className="text-link" href="https://wavewarz.info/wavid" target="_blank" rel="noreferrer">The WavID thesis <span>↗</span></a>
    </header>
    <aside className="roster-panel">
      <div className="panel-heading"><span className="eyebrow">01 / ARTISTS</span><span className="count">{artists.length.toString().padStart(2, '0')}</span></div>
      <h1>History,<br/><em>taking form.</em></h1>
      <p className="intro">An artist’s living signature. Drawn from the history they leave.</p>
      <label className="search"><span aria-hidden="true">⌕</span><input aria-label="Find an artist" placeholder="Find an artist…" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
      <div className="roster-filters"><button aria-pressed={!readyOnly} onClick={()=>setReadyOnly(false)}>All artists <span>{artists.length}</span></button><button aria-pressed={readyOnly} onClick={()=>setReadyOnly(true)}>Ready <span>{artists.filter(a=>a.eligibility?.canBirth).length}</span></button></div>
      <div className="collection-label"><span>{sourceMode === 'live' ? 'WAVEWARZ SNAPSHOT' : sourceMode === 'imported' ? 'IMPORTED CHECKPOINT' : sourceMode === 'provided' ? 'HOST CHECKPOINT' : 'FROZEN COLLECTION'}</span><span>↓</span></div>
      <div className="artist-list" aria-label="Artist collection">
        {filtered.map((entry, index) => <button key={entry.artistKey} className={`artist-row ${selectedKey === entry.artistKey ? 'selected' : ''}`} title={entry.eligibility?.canBirth ? nameOf(entry) : entry.eligibility?.reason} onClick={() => {setSelectedKey(entry.artistKey);setNotice('');}} aria-pressed={selectedKey === entry.artistKey}>
          <span className="artist-number">{String(index + 1).padStart(2, '0')}</span><span className="artist-identity"><strong>{nameOf(entry)}</strong><small>{entry.eligibility?.canBirth ? `${number(entry.quickBattle?.indexedSongs)} songs · ${number(entry.quickBattle?.battles)} battles` : 'Needs a reconciled song identity'}</small></span><span className="artist-arrow">{entry.eligibility?.canBirth ? '↗' : '○'}</span>
        </button>)}
        {!filtered.length && <p className="empty">{busy || 'No artists match your search.'}</p>}
      </div>
      <div className="roster-bottom"><button className="outline-button" disabled={!!busy || cooldown>0} onClick={refreshRoster}><Icon name="refresh" size={15}/>{cooldown>0?`Refresh in ${cooldown}s`:'Load WaveWarz roster'}</button><p>Reads public leaderboard data.<br/>Your current view stays here until it loads.</p><button className="subtle-button" disabled={!!busy} onClick={() => fileRef.current.click()}>↥ Import a saved definition</button><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importDefinition}/></div>
    </aside>
    <main className="workspace" id={`workspace-${instanceId}`} tabIndex={-1}>
      <div className="workspace-heading"><div><span className="eyebrow">02 / THE LIVING SIGNATURE</span><h2>{artist ? nameOf(artist) : 'Opening the studio'}<span className="heading-dot">.</span></h2></div><div className="checkpoint"><span className="eyebrow">{sourceMode === 'live' ? 'OBSERVED' : 'CHECKPOINT'}</span><span>{prettyDate(checkpoint.checkedAt)}</span></div></div>
      <div className="feedback" aria-live="polite">{busy && <p className="busy">{busy}</p>}{(error||renderError) && <p className="error" role="alert">{error||renderError?.message||String(renderError)}</p>}{notice && <p className="notice">{notice}</p>}</div>
      <div className="instrument-layout">
        <section className="preview-panel" aria-label="WavID preview">
          <div className="chamber-label"><span><i/> {playing ? 'IN MOTION' : 'STILL / FRAME ' + String(visibleFrame).padStart(3, '0')}</span><span>MATERIAL 01</span><button className="icon-button focus-button" onClick={()=>setFocus(!focus)} aria-label={focus?'Exit focus view':'Enter focus view'}><Icon name={focus?'close':'focus'} size={16}/></button></div>
          <div className="preview-stage">
            <span className="corner tl"/><span className="corner tr"/><span className="corner bl"/><span className="corner br"/>
            {prepared ? <RenderBoundary key={selectedKey}><WavIdRenderer props={prepared.props} frame={prepared.frame} preparedFrame={prepared} ref={svgRef} style={{height:'100%'}} title={`${nameOf(artist)} — WavID material-v1`}/></RenderBoundary> : <div className="preview-placeholder"><Mark/><p>{error ? 'Preview unavailable' : 'Tracing the form…'}</p></div>}
          </div>
          <div className="chamber-foot"><span>QUANTUM QUIL <b>×</b> WAVEWARZ</span><span>{anatomy?.body?.family || '—'} / {definition?.props?.accent || '—'}</span></div>
          <div className="transport"><button className="play-button" onClick={togglePlayback} disabled={!prepared} aria-label={playing ? 'Pause animation' : 'Play animation'}><Icon name={playing?'pause':'play'} size={16}/></button><input type="range" aria-label="Animation frame" min="0" max="239" value={frame} disabled={!definition} onChange={(event) => {setPlaying(false);setFrame(Number(event.target.value));}}/><span className="timecode">{(visibleFrame / 30).toFixed(2)} <span>/ 8.00s</span></span></div>
          <div className="preview-status"><span>{renderBusy?'Preparing the next frame':'Computed in your browser'}</span><span>Silent loop · 120 BPM · 16 beats</span></div>
        </section>
        <aside className="inspector">
          <div className="inspector-top"><span className="eyebrow">A FORM WITH A HISTORY</span><h3>Every trace<br/>has a source.</h3><p>The form is expressive.<br/>Its relationship to history is inspectable.</p></div>
          <div className="tabs" role="tablist" aria-label="WavID details" onKeyDown={tabKeys}>{['anatomy', 'history', 'source'].map((value) => <button id={`tab-${instanceId}-${value}`} data-tab={value} key={value} role="tab" aria-selected={tab === value} aria-controls={`details-${instanceId}`} tabIndex={tab===value?0:-1} onClick={() => setTab(value)}>{value === 'anatomy' ? 'Form' : value === 'history' ? 'History' : 'Proof'}</button>)}</div>
          <div className="details" id={`details-${instanceId}`} role="tabpanel" aria-labelledby={`tab-${instanceId}-${tab}`}>

            {tab === 'anatomy' ? <>
              <div className="anatomy-row"><span className="anatomy-symbol">◎</span><div><strong>{anatomy?.body?.family || '—'} body</strong><p>The artist’s identity seeds the silhouette.</p></div></div>
              <div className="anatomy-row"><span className="anatomy-symbol">≋</span><div><strong>{anatomy?.bands?.length ?? '—'} song bands</strong><p>Indexed songs shape the internal traces.</p></div></div>
              <div className="anatomy-row"><span className="anatomy-symbol">∴</span><div><strong>{anatomy?.nodes?.length ?? '—'} nodes · {anatomy?.cavities?.length ?? '—'} cavities</strong><p>Battle activity and catalog shape the field.</p></div></div>
              <div className="palette"><span className="eyebrow">IDENTITY PALETTE</span><div>{['accent', 'secondary', 'highlight', 'background'].map((key) => <span key={key} title={`${key}: ${definition?.props?.[key]}`} style={{ background: definition?.props?.[key] || '#18211f' }}/>)}</div></div>
              <p className="interpretation">Activity is history, not a measure of artistic worth.</p>
              <details className="song-ledger"><summary>Inspect the song bands <span>+</span></summary><div>{anatomy?.bands?.map((band, index) => {
                const song = rankedSongs[index % rankedSongs.length];
                return <article key={index}><span className="eyebrow">BAND {String(index + 1).padStart(2, '0')}</span><strong>{song?.songTitle}</strong><p>{number(song?.battles)} battles → width {band.width.toFixed(4)}<br/>{number(song?.totalVolumeSol)} SOL → strength {band.strength.toFixed(4)}</p></article>;
              })}</div></details>
            </> : tab==='history' ? <div className="history-detail">
              <span className="eyebrow">QUICK BATTLE CHECKPOINT</span><h4>{number(stats.battles)} battles <small>{number(stats.indexedSongs)} indexed songs</small></h4>
              <button className="outline-button" disabled={!definition} onClick={rememberCheckpoint}><Icon name="history" size={14}/>Hold for comparison</button>
              {comparison&&<div className="comparison"><span className="eyebrow">{prettyDate(comparison.previous.checkedAt)} → {prettyDate(comparison.next.checkedAt)}</span><p>{comparison.sourceChanged?(comparison.materialChanged?'Recorded history changed the form.':'The source changed; this anatomy stayed the same.'):'These checkpoints contain the same source history.'}</p>{comparison.counts.filter(item=>item.delta!==0).map(item=><div key={item.field}><span>{item.field}</span><strong>{item.delta>0?'+':''}{number(item.delta)}</strong></div>)}</div>}
              <div className="song-history">{artist?.songs?.map((song,index)=><a key={song.musicLink} href={song.musicLink} target="_blank" rel="noreferrer"><span>{String(index+1).padStart(2,'0')}</span><div><strong>{song.songTitle}</strong><small>{number(song.battles)} battles · {number(song.wins)}W / {number(song.losses)}L</small></div><Icon name="arrow" size={11}/></a>)}</div>
            </div> : <div className="provenance">
              <div className="integrity-label"><Icon name="check" size={15}/>{evidence?'Definition reproduced':'No definition to verify'}</div>
              <p>{evidence ? 'The source, visual rules and form agree. This observation is unsigned; it does not prove control of the artist’s account.' : 'Select an artist with reconciled song history to inspect a reproducible definition.'}</p>
              <div className="proof-chain"><span>Observed history</span><i>↓</i><span>Material-v1 rules</span><i>↓</i><span>Reproducible form</span></div>
              <dl><dt>Artist root</dt><dd>{artist?.artistKey||'—'}</dd><dt>Observation time · UTC</dt><dd>{checkpoint.checkedAt||'—'}</dd></dl>
              {['source','props','material'].map(key=><div className="hash-row" key={key}><span>{key==='props'?'Definition':key}</span><button className="hash-copy" disabled={!evidence} title={evidence?.hashes[key]} onClick={()=>copyHash(evidence.hashes[key])}><code>{shortHash(evidence?.hashes[key])}</code><Icon name="copy" size={12}/><span className="sr-only">Copy {key} fingerprint</span></button></div>)}
              <details className="source-details"><summary>Inspect source endpoints</summary>{checkpoint.sources?.map((source,index)=><a key={index} href={source.uri} target="_blank" rel="noreferrer">{source.uri.replace('https://wavewarz.info/api/public/','')}<small>Observed {prettyDate(source.retrievedAt)}</small></a>)}</details>
              <p>Hashes bind bytes. They are not platform signatures or artist approval.</p>
            </div>}

          </div>
          <div className="export-panel"><button className="primary-button" disabled={!prepared || !!busy} onClick={()=>exportPng(false)}>Download still <span>↓</span></button><button className="outline-button" disabled={!definition || !!busy} onClick={exportDefinition}>Save definition <span>↧</span></button><button className="kit-button" disabled={!prepared||!!busy} onClick={()=>dialogRef.current.showModal()}><Icon name="kit" size={15}/>Create identity kit<Icon name="arrow" size={12}/></button></div>
        </aside>
      </div>
      <div className="history-strip"><div><span className="eyebrow">THE RECORDED MOMENT</span><span className="history-caption">Quick Battle history</span></div><div><strong>{number(stats.indexedSongs)}</strong><span>INDEXED SONGS</span></div><div><strong>{number(stats.battles)}</strong><span>BATTLES</span></div><div><strong>{number(stats.wins)}<em> / {number(stats.losses)}</em></strong><span>WINS / LOSSES</span></div><div><strong>{number(stats.totalVolumeSol ?? stats.volumeSol)}</strong><span>TRADING VOLUME · SOL</span></div></div>
      <p className="coverage-note">{sourceMode === 'imported' ? 'Imported checkpoint · supplied history has not been authenticated with WaveWarz.' : 'Leaderboard-derived checkpoint · source queries cover up to 500 artist rows and 500 songs ranked by volume. Counts describe those records, not a complete catalog or roster.'}</p>
      <footer><span>HISTORY LEAVES FORM.</span><span>WavID by OxQuan <b>·</b> Material-v1 / Studio 0.2</span></footer>
    </main>
    <dialog ref={dialogRef} className="export-dialog" aria-labelledby={`export-title-${instanceId}`}><button className="icon-button dialog-close" aria-label="Close export dialog" onClick={()=>dialogRef.current.close()}><Icon name="close"/></button><span className="eyebrow">THE ARTWORK + ITS EVIDENCE</span><h2 id={`export-title-${instanceId}`}>Keep the history<br/><em>with the form.</em></h2><p>An identity kit keeps this exact still, the portable source definition, and an unsigned verification receipt together.</p><div className="kit-contents"><span><Icon name="layers"/>Artwork.png</span><span><Icon name="source"/>Identity.json</span><span><Icon name="check"/>Receipt.json</span></div><label className="size-label">Still resolution<select value={exportSize} onChange={e=>setExportSize(Number(e.target.value))}><option value={1080}>1080 × 1080 · Standard</option><option value={2160}>2160 × 2160 · High resolution</option></select></label><p>The receipt records the image’s SHA-256, source and definition fingerprints, renderer version and frame. It establishes file relationships, not ownership.</p><button className="primary-button" disabled={!prepared||!!busy} onClick={()=>exportPng(true)}>Download identity kit <Icon name="download" size={16}/></button></dialog>
  </div>;
}
