import React, { Component, useEffect, useMemo, useState } from 'react';
import { generateDefinition } from '../core/index.mjs';
import { WavIdRenderer, usePreparedWavIdFrame } from '../renderer';
import { loadFrozenRoster } from '../studio/roster.mjs';
import { CARD_POSTER_FRAME } from './face.mjs';
import { handleFromArtist, resolveAudiusProfile } from './payload.mjs';
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
  const { prepared, error } = usePreparedWavIdFrame(definition?.props, CARD_POSTER_FRAME);
  if (!definition || error) return <p className="card-empty">This observation could not generate a material-v1 preview.</p>;
  return <div className="card-art">
    {prepared
      ? <PreviewBoundary><WavIdRenderer props={prepared.props} frame={prepared.frame} preparedFrame={prepared} title={`${artist.displayName} — WavID card`} /></PreviewBoundary>
      : <p className="card-empty">Preparing the WavID preview…</p>}
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
  return <section className="card-player" aria-label="Play on this page">
    <h2>Play</h2>
    {players.map((track) => <article key={track.permalink}>
      <h3>{track.title}</h3>
      {track.streamUrl && <audio controls preload="none" src={track.streamUrl} />}
      {track.embedUrl && <iframe title={`${track.title} on Audius`} src={track.embedUrl} allow="encrypted-media" loading="lazy" />}
    </article>)}
    <ul className="card-tracks">
      {tracks.map((track) => <li key={track.permalink}><a href={track.permalink}>{track.title}</a></li>)}
    </ul>
    {note && <p>{note}</p>}
  </section>;
}

export function CardResolve({
  handle = '',
  artist = null,
  roster = null,
  fixtureBaseUrl = null,
  blockedReason = '',
  onScan,
  onStudio,
}) {
  const resolved = resolveAudiusProfile(handle ? { handle } : { handle: '' });
  const failure = resolved.ok ? '' : (blockedReason || resolved.reason);
  const [loaded, setLoaded] = useState(null);
  const [loadNote, setLoadNote] = useState('');

  useEffect(() => {
    const previous = document.title;
    document.title = resolved.ok ? `${resolved.handle} · WavID card` : 'WavID card';
    return () => { document.title = previous; };
  }, [resolved.ok, resolved.handle]);

  useEffect(() => {
    if (!resolved.ok || artist || roster || !fixtureBaseUrl) return undefined;
    let disposed = false;
    const controller = new AbortController();
    setLoadNote('Loading the frozen observation…');
    loadFrozenRoster(fixtureBaseUrl, controller.signal).then((data) => {
      if (disposed) return;
      setLoaded(data);
      setLoadNote('');
    }).catch((error) => {
      if (disposed || error?.name === 'AbortError') return;
      setLoadNote(error.message || 'The example collection could not be loaded.');
    });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [resolved.ok, resolved.artistKey, artist, roster, fixtureBaseUrl]);

  const snapshot = roster || loaded;
  const matched = artist && handleFromArtist(artist)?.toLocaleLowerCase('en-US') === resolved.handle?.toLocaleLowerCase('en-US')
    ? artist
    : snapshot?.artists?.find((entry) => entry.artistKey === resolved.artistKey && handleFromArtist(entry)) || null;
  const canPreview = Boolean(matched?.eligibility?.canBirth && handleFromArtist(matched));
  const displayName = matched?.displayName || resolved.handle;

  return <div className="wavid-card">
    <header className="card-top">
      <div>
        <span className="eyebrow">WAVID CARD</span>
        <h1>{resolved.ok ? displayName : 'No profile link'}</h1>
      </div>
      <div className="card-nav">
        {onScan && <button type="button" className="text-button" onClick={onScan}>Scan</button>}
        {onStudio && <button type="button" className="text-button" onClick={onStudio}>Studio</button>}
      </div>
    </header>

    {!resolved.ok && <div className="card-empty" role="status">
      <p>{failure}</p>
      <p>No Audius profile was created for this card.</p>
    </div>}

    {resolved.ok && <>
      {canPreview && <CardArt artist={matched} roster={snapshot} />}
      {!canPreview && <div className="card-empty" role="status">
        <p>{matched
          ? (matched.eligibility?.reason || 'This artist is not eligible for a material-v1 preview.')
          : (loadNote || 'No WavID observation is loaded for this handle. The profile link uses only the handle in the card URL.')}</p>
      </div>}
      <p className="card-handle">{resolved.handle}</p>
      <p className="card-key">{resolved.artistKey}</p>
      <CardPlayer artist={matched} handle={resolved.handle} />
      <a className="primary-button card-cta" href={resolved.audiusUrl}>Open Audius profile</a>
      <p className="card-target">{resolved.audiusUrl}</p>
      <p className="card-note">Public observation. This page does not prove control of the artist, and it does not invent a profile when the handle is missing.</p>
    </>}
  </div>;
}
