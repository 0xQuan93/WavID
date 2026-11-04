import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import { generateDefinition } from '../core/index.mjs';
import { WavIdRenderer, usePreparedWavIdFrame } from '../renderer';
import { fetchPublicRoster, loadFrozenRoster } from '../studio/roster.mjs';
import { buildAnatomyCallouts, calloutLabelBox, readCardIdentity, visibleCallouts } from './callouts.mjs';
import { CARD_POSTER_FRAME } from './face.mjs';
import { findCardArtist, resolveCardArtist } from './match.mjs';
import { resolveAudiusProfile } from './payload.mjs';
import { resolveAudiusTrack, tracksForArtist } from './playback.mjs';

class PreviewBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    return this.state.error
      ? <p className="card-empty">This preview could not be drawn.</p>
      : this.props.children;
  }
}

function pointerIsTouch(event) {
  return event.pointerType === 'touch';
}

function AnatomyCallouts({ callouts, reveal, setReveal, frameRef }) {
  const visible = visibleCallouts(callouts, reveal);
  const shown = new Set(visible.map((entry) => entry.id));

  function enterHit(event, id) {
    if (pointerIsTouch(event)) return;
    setReveal(id);
  }

  function leaveHit(event) {
    if (pointerIsTouch(event)) return;
    const frame = frameRef.current;
    if (frame && event.relatedTarget instanceof Node && frame.contains(event.relatedTarget)) setReveal('form');
    else setReveal(null);
  }

  function pressHit(event, id) {
    if (!pointerIsTouch(event)) return;
    event.stopPropagation();
    setReveal(id);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* The hold still reveals without capture. */ }
  }

  function releaseHit(event) {
    if (!pointerIsTouch(event)) return;
    event.stopPropagation();
    setReveal(null);
  }

  return <>
    <svg className="card-callout-lines" viewBox="0 0 1080 1080" aria-hidden="true">
      {visible.map((entry) => {
        const label = calloutLabelBox(entry, reveal);
        return <g key={entry.id}>
          <line x1={entry.anchor.x} y1={entry.anchor.y} x2={label.x} y2={label.y} stroke="#c8ffd9" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
          <circle cx={entry.anchor.x} cy={entry.anchor.y} r="5" fill="#e9fff3" />
        </g>;
      })}
    </svg>
    <div className="card-callout-ui">
      {callouts.map((entry) => <button
        key={entry.id}
        type="button"
        className="card-hit"
        style={{
          left: `${(entry.anchor.x / 1080) * 100}%`,
          top: `${(entry.anchor.y / 1080) * 100}%`,
          width: `${(entry.hit / 1080) * 100}%`,
          height: `${(entry.hit / 1080) * 100}%`,
        }}
        aria-expanded={shown.has(entry.id)}
        aria-label={entry.aria}
        onPointerEnter={(event) => enterHit(event, entry.id)}
        onPointerLeave={leaveHit}
        onPointerDown={(event) => pressHit(event, entry.id)}
        onPointerUp={releaseHit}
        onPointerCancel={releaseHit}
        onFocus={() => setReveal(entry.id)}
        onBlur={(event) => {
          const frame = frameRef.current;
          if (frame && event.relatedTarget instanceof Node && frame.contains(event.relatedTarget)) return;
          setReveal(null);
        }}
      />)}
      {visible.map((entry) => {
        const label = calloutLabelBox(entry, reveal);
        return <div
          key={`${entry.id}-label`}
          className="card-callout card-glass"
          data-align={label.align}
          style={{ left: `${(label.x / 1080) * 100}%`, top: `${(label.y / 1080) * 100}%` }}
          aria-hidden="true"
        >
          <span className="eyebrow">{entry.kicker}</span>
          <strong>{entry.title}</strong>
          {entry.detail && <p>{entry.detail}</p>}
        </div>;
      })}
    </div>
  </>;
}

function CardArt({ artist, roster }) {
  const held = roster?.checkpoints?.[artist.artistKey];
  const checkedAt = held?.checkedAt || roster?.checkedAt || roster?.retrievedAt;
  const rosterSnapshotSha256 = held?.rosterSnapshotSha256 || roster?.snapshotSha256;
  const sources = held?.sources || roster?.sources;
  const definition = useMemo(() => {
    try {
      return generateDefinition(artist, { checkedAt, rosterSnapshotSha256, sources });
    } catch {
      return null;
    }
  }, [artist, checkedAt, rosterSnapshotSha256, sources]);
  const callouts = useMemo(() => (definition ? buildAnatomyCallouts(definition) : []), [definition]);
  const [reveal, setReveal] = useState(null);
  const frameRef = useRef(null);
  const { prepared, error } = usePreparedWavIdFrame(definition?.props, CARD_POSTER_FRAME);
  useEffect(() => { setReveal(null); }, [definition]);
  const pending = !definition || error
    ? 'This observation could not generate a material-v1 preview.'
    : (prepared ? '' : 'Preparing the WavID preview…');
  return <div className="card-art">
    <div
      className="card-art-frame"
      ref={frameRef}
      onPointerEnter={(event) => { if (!pointerIsTouch(event)) setReveal('form'); }}
      onPointerLeave={(event) => { if (!pointerIsTouch(event)) setReveal(null); }}
      onPointerDown={(event) => { if (pointerIsTouch(event)) setReveal('form'); }}
      onPointerUp={(event) => { if (pointerIsTouch(event)) setReveal(null); }}
      onPointerCancel={() => setReveal(null)}
    >
      {pending
        ? <p className="card-empty">{pending}</p>
        : <PreviewBoundary><WavIdRenderer className="card-render" props={prepared.props} frame={prepared.frame} preparedFrame={prepared} title={`${artist.displayName} — WavID card`} /></PreviewBoundary>}
      {!pending && callouts.length > 0 && <AnatomyCallouts callouts={callouts} reveal={reveal} setReveal={setReveal} frameRef={frameRef} />}
    </div>
  </div>;
}

function CardPlayer({ artist, handle }) {
  const tracks = useMemo(() => tracksForArtist(artist, handle), [artist, handle]);
  const [players, setPlayers] = useState([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!tracks.length) return undefined;
    let disposed = false;
    setNote('');
    setPlayers([]);
    Promise.all(tracks.slice(0, 3).map(async (track) => {
      try {
        const playback = await resolveAudiusTrack(track.permalink);
        return playback ? { ...track, ...playback, title: playback.title || track.title } : null;
      } catch {
        return null;
      }
    })).then((resolved) => {
      if (disposed) return;
      const playable = resolved.filter(Boolean);
      setPlayers(playable);
      if (!playable.length) setNote('These songs could not start in the page. The links still open them on Audius.');
    });
    return () => { disposed = true; };
  }, [tracks]);

  if (!tracks.length) return null;
  return <details className="card-player card-glass" aria-label="Play on this page">
    <summary>Play</summary>
    {players.map((track) => <article key={track.permalink}>
      <h3>{track.title}</h3>
      {track.streamUrl && <audio controls preload="none" src={track.streamUrl} />}
      {track.embedUrl && <iframe title={`${track.title} on Audius`} src={track.embedUrl} allow="encrypted-media" loading="lazy" />}
    </article>)}
    <ul className="card-tracks">
      {tracks.map((track) => <li key={track.permalink}><a href={track.permalink}>{track.title}</a></li>)}
    </ul>
    {note && <p>{note}</p>}
  </details>;
}

export function CardResolve({
  handle = '',
  artist = null,
  roster = null,
  fixtureBaseUrl = null,
  loadRoster = null,
  blockedReason = '',
  onScan,
  onStudio,
}) {
  const resolved = resolveAudiusProfile(handle ? { handle } : { handle: '' });
  const failure = resolved.ok ? '' : (blockedReason || resolved.reason);
  const [loaded, setLoaded] = useState(null);
  const [loadNote, setLoadNote] = useState(() => (artist || roster || !handle) ? '' : 'Loading the WavID observation…');
  const heldRef = useRef(null);
  const loadRosterRef = useRef(loadRoster);
  loadRosterRef.current = loadRoster;

  const snapshot = roster || loaded;
  const decision = resolveCardArtist({
    handle: resolved.ok ? resolved.handle : '',
    artist,
    roster: snapshot,
  });
  const matched = decision.artist;
  const profile = decision.profile;
  const canPreview = decision.canPreview;
  const displayName = matched?.displayName || profile.handle || resolved.handle;

  useEffect(() => {
    const previous = document.title;
    document.title = resolved.ok ? `${displayName} · WavID card` : 'WavID card';
    return () => { document.title = previous; };
  }, [resolved.ok, displayName]);

  useEffect(() => {
    if (!resolved.ok || artist || roster) {
      if (artist || roster) setLoadNote('');
      return undefined;
    }
    const held = heldRef.current;
    if (held && findCardArtist(held.artists, resolved)?.artist) {
      setLoaded(held);
      setLoadNote('');
      return undefined;
    }
    let disposed = false;
    const controller = new AbortController();
    (async () => {
      let frozen = null;
      if (fixtureBaseUrl) {
        setLoadNote('Loading the frozen observation…');
        try {
          frozen = await loadFrozenRoster(fixtureBaseUrl, controller.signal);
        } catch (error) {
          if (disposed || error?.name === 'AbortError') return;
        }
        if (disposed) return;
        if (frozen && findCardArtist(frozen.artists, resolved)?.artist) {
          heldRef.current = frozen;
          setLoaded(frozen);
          setLoadNote('');
          return;
        }
      }
      if (disposed) return;
      setLoadNote('Loading the WaveWarz roster…');
      try {
        const live = await (loadRosterRef.current || fetchPublicRoster)({ signal: controller.signal });
        if (disposed) return;
        heldRef.current = live;
        setLoaded(live);
        setLoadNote('');
      } catch (error) {
        if (disposed || error?.name === 'AbortError') return;
        if (frozen) {
          heldRef.current = frozen;
          setLoaded(frozen);
        }
        setLoadNote(error.message || 'The public roster could not be loaded.');
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [resolved.ok, resolved.handle, resolved.artistKey, artist, roster, fixtureBaseUrl]);

  const identity = resolved.ok && matched ? readCardIdentity(matched) : { x: null, avatar: null, main: null };
  return <div className="wavid-card card-focal" data-layout="id-focal">
    <div className="card-stage">
      {resolved.ok && canPreview && <CardArt artist={matched} roster={snapshot} />}
      <div className="card-hud">
        {(onScan || onStudio) && <div className="card-nav card-glass">
          {onScan && <button type="button" className="text-button" onClick={onScan}>Scan</button>}
          {onStudio && <button type="button" className="text-button" onClick={onStudio}>Studio</button>}
        </div>}

        {!resolved.ok && <div className="card-empty card-glass" role="status">
          <p>{failure}</p>
          <p>No Audius profile was created for this card.</p>
        </div>}

        {resolved.ok && !canPreview && <div className="card-empty card-glass" role="status">
          <p>{decision.artist
            ? (decision.reason || 'This artist is not eligible for a material-v1 preview.')
            : (decision.reason || loadNote || 'No WavID observation is loaded for this handle. The profile link uses only the handle in the card URL.')}</p>
        </div>}

        {resolved.ok && <div className="card-dock">
          <div className="card-identity">
            {identity.avatar
              ? <img className="card-avatar" src={identity.avatar} alt="" />
              : <span className="card-avatar card-avatar-fallback" aria-hidden="true">{String(displayName || '?').trim().slice(0, 1).toUpperCase()}</span>}
            <div>
              <h1>{displayName}</h1>
              <p className="card-handle">
                {identity.x
                  ? <a href={identity.x.url}>@{identity.x.handle}</a>
                  : <><span className="card-at" aria-hidden="true">@</span>{profile.handle}</>}
                <a href={profile.audiusUrl}>Audius <span aria-hidden="true">›</span></a>
              </p>
            </div>
          </div>
          <section className="card-stream card-glass" aria-label="Stream equivalent">
            <div className="card-stream-main">
              <div>
                <span className="eyebrow">Spotify stream equivalent</span>
                <p className="card-host-metric">Host-supplied</p>
                <p className="card-note">No settlement stream count is in this observation.</p>
              </div>
              <div className="card-foot-action">
                <a className="primary-button card-cta" href={profile.audiusUrl}>Open Audius profile</a>
                <p className="card-target">{profile.audiusUrl}</p>
              </div>
            </div>
            {decision.alias && profile.ok && <p className="card-note">
              {matched?.displayName || profile.handle}’s Audius handle is {profile.handle}. This page opened it from the path {decision.route.handle}. The card path is {profile.cardPath}.
            </p>}
            <p className="card-note">Public observation. This page does not prove control of the artist, and it does not invent a profile when the handle is missing.</p>
            {identity.main && <p className="card-note">Main Event roster: {identity.main.wins}W / {identity.main.losses}L. It does not shape this ID.</p>}
            <p className="card-key">{profile.artistKey}</p>
          </section>
          <CardPlayer artist={matched} handle={profile.handle} />
        </div>}
      </div>
    </div>
  </div>;
}
