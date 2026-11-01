import React, { Component, useEffect, useMemo, useState } from 'react';
import { generateDefinition } from '../core/index.mjs';
import { WavIdRenderer, usePreparedWavIdFrame } from '../renderer';
import { createLiveBattlePoller } from './poll.mjs';
import {
  DELAY_LABEL,
  battleResultPlan,
  factorLines,
  formatObservationClock,
  resolveBattleArtists,
} from './observe.mjs';
import { describeBattleOverlay } from './overlay-v0.mjs';

const POSTER_FRAME = 88;
const solText = (value) => value == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
const typeLabel = (type) => type === 'quick' ? 'Quick Battle' : type === 'main' ? 'Main Event round' : type === 'community' ? 'Community battle' : 'Battle';

class BattleBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    return this.state.error
      ? <p className="battle-quiet">This form could not be drawn from the current snapshot.</p>
      : this.props.children;
  }
}

function BattleForm({ artist, roster, title }) {
  const held = roster?.checkpoints?.[artist.artistKey];
  const checkedAt = held?.checkedAt || roster?.checkedAt || roster?.retrievedAt;
  const rosterSnapshotSha256 = held?.rosterSnapshotSha256 || roster?.snapshotSha256;
  const sources = held?.sources || roster?.sources;
  const definition = useMemo(() => {
    try { return generateDefinition(artist, { checkedAt, rosterSnapshotSha256, sources }); }
    catch { return null; }
  }, [artist, checkedAt, rosterSnapshotSha256, sources]);
  const { prepared, error } = usePreparedWavIdFrame(definition?.props, POSTER_FRAME);
  if (!definition || error) return <p className="battle-quiet">This snapshot could not generate a material-v1 form.</p>;
  return <div className="battle-stage">
    {prepared
      ? <BattleBoundary><WavIdRenderer props={prepared.props} frame={prepared.frame} preparedFrame={prepared} title={`${title} — WavID material-v1`} /></BattleBoundary>
      : <p className="battle-quiet">Tracing the roster form…</p>}
  </div>;
}

function BattleSide({ entry, roster, winner, songTitle }) {
  const heading = entry.artist?.displayName || entry.side.audiusHandle || entry.side.label;
  const sideName = entry.side.id === 'artist1' ? 'Side A' : 'Side B';
  return <article className={winner ? 'battle-side winner' : 'battle-side'} aria-label={`${sideName}${winner ? ', recorded winner' : ''}`}>
    <header><span className="eyebrow">{entry.side.id === 'artist1' ? 'SIDE A' : 'SIDE B'}</span>{winner && <span className="battle-winner">RECORDED WINNER</span>}</header>
    <h3>{heading}</h3>
    {songTitle && entry.side.audiusHandle && songTitle !== heading && <p className="battle-quiet">{songTitle}</p>}
    <p className="battle-quiet">{entry.unresolvedReason || (entry.side.audiusHandle ? `Audius · ${entry.side.audiusHandle}` : 'Audius identity unresolved')}</p>
    {entry.side.musicLink && <a href={entry.side.musicLink} target="_blank" rel="noreferrer">Audius track</a>}
    {entry.side.wallet && <p className="battle-wallet">{entry.side.wallet}</p>}
    <dl className="battle-meters"><div><dt>POOL</dt><dd>{solText(entry.side.poolSol)} SOL</dd></div><div><dt>VOLUME</dt><dd>{solText(entry.side.volumeSol)} SOL</dd></div></dl>
    {entry.artist
      ? <BattleForm artist={entry.artist} roster={roster} title={heading} />
      : <p className="battle-unresolved">WavID unresolved</p>}
    {entry.artist && <p className="battle-note">material-v1 · roster snapshot · frame {POSTER_FRAME}</p>}
  </article>;
}

export function BattlePanel({ roster = null, onRefreshRoster, refreshDisabled = false, refreshCooldown = 0 }) {
  const [view, setView] = useState(() => ({ visible: false, inflight: false, sample: null, lastError: null }));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let active = true;
    const poller = createLiveBattlePoller({ onChange: (next) => { if (active) setView(next); } });
    const sync = () => poller.setVisible(typeof document !== 'undefined' && document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', sync);
      poller.stop();
    };
  }, []);
  const sample = view.sample;
  const battle = sample?.status === 'live' ? sample.battle : null;
  useEffect(() => {
    if (!battle?.endsAt || !view.visible) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [battle?.endsAt, sample?.checkedAt, view.visible]);
  const resolved = battle ? resolveBattleArtists(battle, roster?.artists || []) : [];
  const plan = battleResultPlan(sample, roster?.artists || []);
  const overlay = describeBattleOverlay(sample);
  const lines = factorLines(battle);
  const failure = view.lastError && !view.inflight
    ? (sample ? 'Last check failed. Showing the previous observation.' : 'The battle feed did not respond. Another check will run while this tab is open.')
    : '';
  const statusText = !sample
    ? (view.inflight ? 'Checking the public battle feed.' : 'No battle observation yet.')
    : battle
      ? `${typeLabel(battle.type)} observed. ${DELAY_LABEL}.`
      : `No live battle in the last check. ${DELAY_LABEL}.`;

  return <section className="battle-panel" aria-label="Live battle observation" data-overlay={overlay.id} data-overlay-version={overlay.version} data-observation={sample?.schema || 'pending'} data-battle-status={battle ? 'live' : sample ? 'empty' : 'pending'}>
    <p className="sr-only" aria-live="polite">{statusText}{failure ? ` ${failure}` : ''}</p>
    <div className="battle-heading">
      <span className="eyebrow">{battle ? `${typeLabel(battle.type).toUpperCase()} · DELAYED` : 'LIVE BATTLE · DELAYED'}</span>
      <span className="battle-delay">{DELAY_LABEL}</span>
    </div>
    {!sample && <p className="battle-quiet">{view.inflight ? 'Checking the public battle feed…' : 'No battle observation yet.'}</p>}
    {sample && !battle && <p className="battle-quiet">No live battle in the last check.</p>}
    {battle && <>
      <div className="battle-statusline">
        <span className="battle-clock" aria-hidden="true">{formatObservationClock(battle.endsAt, now)}</span>
        {battle.url && <a href={battle.url} target="_blank" rel="noreferrer">Battle page</a>}
      </div>
      {sample.liveCount > 1 && <p className="battle-livecount">Showing the first of {sample.liveCount} live rows from this check.</p>}
      <div className="battle-duel">
        {resolved.map((entry) => <BattleSide key={entry.side.id} entry={entry} roster={roster} winner={battle.winnerDecided && battle.winnerSide === entry.side.id} songTitle={battle.type === 'quick' ? entry.side.label : ''} />)}
      </div>
      {!!lines.length && <ul className="battle-factors">{lines.map((line) => <li key={line.key}>{line.text}</li>)}</ul>}
      {battle.factors?.djWavyReasoning && <p className="battle-note">{battle.factors.djWavyReasoning}</p>}
      <p className="battle-note">Pools, volumes, and factors are battle-feed observations. They do not change the material-v1 form.</p>
      {plan && <div className="battle-result">
        <p>Recorded winner: {plan.label}. Refresh the roster snapshot when you want a new checkpoint. The form stays on the current snapshot until that load finishes.</p>
        <button type="button" className="outline-button" disabled={refreshDisabled || !onRefreshRoster} onClick={() => onRefreshRoster?.(plan)}>
          {refreshCooldown > 0 ? `Refresh in ${refreshCooldown}s` : 'Refresh roster snapshot'}
        </button>
        {plan.beforeAfter.available && <p className="battle-note">Before/after uses compareCheckpoints on the held export after that refresh. Battle pressure is not written into material-v1.</p>}
      </div>}
    </>}
    {sample && <p className="battle-meta"><time dateTime={sample.checkedAt}>Checked {sample.checkedAt}</time>{view.visible ? '' : ' · paused while this tab is hidden'}</p>}
    {failure && <p className="battle-quiet">{failure}</p>}
  </section>;
}
