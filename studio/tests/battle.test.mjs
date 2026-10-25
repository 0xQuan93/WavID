import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateDefinition } from '../src/core/index.mjs';
import {
  DELAY_LABEL,
  artistKeyFromMusicLink,
  battleResultPlan,
  factorLines,
  formatObservationClock,
  parseLiveBattleResponse,
  resolveBattleArtists,
} from '../src/battle/observe.mjs';
import { describeBattleOverlay } from '../src/battle/overlay-v0.mjs';
import {
  LIVE_BATTLES_URL,
  MIN_POLL_INTERVAL_MS,
  createLiveBattlePoller,
  initialPollState,
  pollDelay,
  reducePoll,
} from '../src/battle/poll.mjs';

const CHECKED = '2026-10-25T16:00:01.000Z';
const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');
const livePayload = JSON.parse(await read('./fixtures/live-battle.json'));
const oxquan = JSON.parse(await read('../public/fixtures/oxquan.json'));
const godcloud = JSON.parse(await read('../public/fixtures/godcloud.json'));

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body) };
}

function clock(start = Date.parse(CHECKED)) {
  let now = start;
  const queue = [];
  return {
    now: () => now,
    advance(ms) { now += ms; },
    schedule(fn, ms) {
      const item = { fn, due: now + ms, cancelled: false };
      queue.push(item);
      return item;
    },
    clear(item) { if (item) item.cancelled = true; },
    due() { return queue.filter((item) => !item.cancelled && item.due <= now); },
    pending() { return queue.filter((item) => !item.cancelled); },
    fireDue() {
      const ready = queue.filter((item) => !item.cancelled && item.due <= now);
      for (const item of ready) item.cancelled = true;
      return (async () => {
        for (const item of ready) await item.fn();
      })();
    },
  };
}

test('delay label is explicit and the overlay does not touch material-v1', () => {
  assert.equal(DELAY_LABEL, 'observed every ~30s · delayed');
  assert.doesNotMatch(DELAY_LABEL, /real-time|realtime/i);
  const overlay = describeBattleOverlay(null);
  assert.equal(overlay.id, 'wavewarz-battle-overlay-v0');
  assert.equal(overlay.altersMaterialV1, false);
  assert.equal(overlay.interaction, 'none');
});

test('audius music links become the roster artist key and unsafe links do not', () => {
  assert.deepEqual(artistKeyFromMusicLink('https://audius.co/_0xQuan/igothop'), {
    handle: '_0xQuan',
    artistKey: 'wavewarz:audius:_0xquan',
    profileUrl: 'https://audius.co/_0xQuan',
    trackUrl: 'https://audius.co/_0xQuan/igothop',
  });
  assert.equal(artistKeyFromMusicLink('https://audius.co/GodclouD/fuck-yo-feelingz').artistKey, 'wavewarz:audius:godcloud');
  for (const link of [
    'https://example.com/track',
    'http://audius.co/GodclouD/track',
    'https://www.audius.co/GodclouD/track',
    'https://user:password@audius.co/GodclouD/track',
    'javascript:alert(1)',
    '',
  ]) assert.equal(artistKeyFromMusicLink(link), null);
});

test('a live payload resolves both sides and an empty feed stays empty', () => {
  const sample = parseLiveBattleResponse(livePayload, { checkedAt: CHECKED });
  assert.equal(sample.status, 'live');
  assert.equal(sample.checkedAt, CHECKED);
  assert.equal(sample.realtime, false);
  assert.equal(sample.delayLabel, DELAY_LABEL);
  assert.equal(sample.battle.sides.artist1.artistKey, 'wavewarz:audius:_0xquan');
  assert.equal(sample.battle.sides.artist2.artistKey, 'wavewarz:audius:godcloud');
  assert.equal(sample.battle.sides.artist1.poolSol, 1.25);
  assert.equal(sample.battle.winnerDecided, false);
  const resolved = resolveBattleArtists(sample.battle, [oxquan.source.artist, godcloud.source.artist]);
  assert.equal(resolved[0].artist.displayName, 'OxQuan');
  assert.equal(resolved[1].artist.displayName, 'GodclouD');
  assert.equal(resolved[0].unresolvedReason, null);
  assert.match(factorLines(sample.battle).find((line) => line.key === 'charts').text, /not the result/);
  assert.equal(parseLiveBattleResponse({ battles: [], updatedAt: CHECKED }, { checkedAt: CHECKED }).status, 'empty');
  assert.equal(parseLiveBattleResponse({ updatedAt: CHECKED }, { checkedAt: CHECKED }).battle, null);
  const settled = structuredClone(livePayload);
  settled.battles[0].live = false;
  assert.equal(parseLiveBattleResponse(settled, { checkedAt: CHECKED }).status, 'empty');
});

test('wallet-only sides stay unresolved and a recorded winner only plans a refresh', () => {
  const payload = {
    updatedAt: CHECKED,
    battles: [{
      battleId: 42,
      type: 'main',
      live: true,
      winnerDecided: true,
      winnerSide: 'artist2',
      artist1: { name: 'R3plic4nT', wallet: 'HEB2wallethVt', poolSol: 0.2, volumeSol: 0.4 },
      artist2: { name: 'Stormi', wallet: '2J32wallet8bXp', poolSol: 0.5, volumeSol: 0.9 },
      factors: { humanJudgeWinner: 'artist2', xPollWinner: 'artist1', solVoteWinner: 'artist2' },
      createdAt: CHECKED,
      endsAt: '2026-10-25T16:10:00.000Z',
    }],
  };
  const sample = parseLiveBattleResponse(payload, { checkedAt: CHECKED });
  const [left, right] = resolveBattleArtists(sample.battle, [oxquan.source.artist]);
  assert.equal(left.side.artistKey, null);
  assert.equal(left.artist, null);
  assert.match(left.unresolvedReason, /Wallet-only/);
  assert.equal(right.side.resolved, false);
  const plan = battleResultPlan(sample);
  assert.equal(plan.action, 'refresh-roster-snapshot');
  assert.equal(plan.autoMutate, false);
  assert.equal(plan.artistKey, null);
  assert.equal(plan.altersMaterialV1, false);
  assert.equal(plan.beforeAfter.available, false);
  assert.equal(plan.beforeAfter.method, 'compareCheckpoints');
  assert.equal(typeof plan.beforeAfter.note, 'string');
  const undecided = parseLiveBattleResponse(livePayload, { checkedAt: CHECKED });
  assert.equal(battleResultPlan(undecided), null);
  const missingSide = structuredClone(payload);
  missingSide.battles[0].winnerDecided = true;
  missingSide.battles[0].winnerSide = null;
  assert.equal(battleResultPlan(parseLiveBattleResponse(missingSide, { checkedAt: CHECKED })), null);
});

test('battle observations do not change a frozen material-v1 definition', () => {
  const artist = oxquan.source.artist;
  const checkpoint = {
    checkedAt: oxquan.source.rosterCheckedAt,
    rosterSnapshotSha256: oxquan.source.rosterSnapshotSha256,
    sources: oxquan.source.sources,
  };
  const before = generateDefinition(artist, checkpoint).props;
  const sample = parseLiveBattleResponse(livePayload, { checkedAt: CHECKED });
  assert.equal(describeBattleOverlay(sample).altersMaterialV1, false);
  assert.equal(resolveBattleArtists(sample.battle, [artist])[0].artist, artist);
  const after = generateDefinition(artist, checkpoint).props;
  assert.deepEqual(after, before);
  assert.equal(after.anatomy.fingerprint, before.anatomy.fingerprint);
});

test('parser rejects samples without checkedAt and keeps non-lists as failures', () => {
  assert.throws(() => parseLiveBattleResponse({ battles: [] }, {}), /Battle observation/);
  assert.throws(() => parseLiveBattleResponse(['nope'], { checkedAt: CHECKED }), /not an object/);
  assert.throws(() => parseLiveBattleResponse({ battles: {} }, { checkedAt: CHECKED }), /battle list/);
});

test('the observation clock describes the last sample, including an elapsed window', () => {
  const ends = '2026-10-25T16:08:00.000Z';
  assert.equal(formatObservationClock(ends, Date.parse('2026-10-25T16:06:30.000Z')), '1:30 left in the last observation');
  assert.equal(formatObservationClock(ends, Date.parse('2026-10-25T16:08:00.000Z')), 'Window elapsed in the last observation');
  assert.equal(formatObservationClock(null, Date.parse(CHECKED)), 'End time not in the last observation');
});

test('poll delay stays at least 30 seconds and hidden or in-flight states do not poll', () => {
  const state = { ...initialPollState(), visible: true, lastAttemptAt: 1_000 };
  assert.equal(MIN_POLL_INTERVAL_MS, 30_000);
  assert.equal(pollDelay(state, 1_000), 30_000);
  assert.equal(pollDelay(state, 30_999), 1);
  assert.equal(pollDelay(state, 31_000), 0);
  assert.equal(pollDelay({ ...state, visible: false }, 99_000), null);
  assert.equal(pollDelay({ ...state, inflight: true }, 99_000), null);
  assert.equal(pollDelay({ ...initialPollState(), visible: true }, 0), 0);
  const failed = reducePoll({ ...state, sample: { status: 'live', checkedAt: CHECKED }, inflight: true }, {
    type: 'attempt-failure',
    message: 'offline',
    checkedAt: '2026-10-25T16:00:31.000Z',
  });
  assert.equal(failed.sample.status, 'live');
  assert.equal(failed.lastError.message, 'offline');
  assert.equal(failed.inflight, false);
});

test('the poller fetches only the live battle route, without credentials, and only while visible', async () => {
  const ticks = clock();
  const calls = [];
  let body = livePayload;
  const poller = createLiveBattlePoller({
    now: ticks.now,
    schedule: ticks.schedule,
    clearSchedule: ticks.clear,
    fetchImpl: async (url, init) => {
      calls.push({ url, credentials: init.credentials, keys: Object.keys(init).sort() });
      if (body instanceof Error) throw body;
      return jsonResponse(body);
    },
  });
  poller.setVisible(false);
  ticks.advance(60_000);
  await ticks.fireDue();
  assert.equal(calls.length, 0);

  poller.setVisible(true);
  await ticks.fireDue();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, LIVE_BATTLES_URL);
  assert.equal(calls[0].credentials, 'omit');
  assert.deepEqual(calls[0].keys, ['credentials', 'signal']);
  assert.match(calls[0].url, /\/api\/public\/battles\?live=true$/);
  assert.equal(poller.snapshot().sample.status, 'live');
  assert.equal(poller.snapshot().sample.checkedAt, new Date(ticks.now()).toISOString());

  ticks.advance(29_999);
  await ticks.fireDue();
  assert.equal(calls.length, 1);
  ticks.advance(1);
  body = new Error('network down');
  await ticks.fireDue();
  assert.equal(calls.length, 2);
  assert.equal(poller.snapshot().sample.status, 'live');
  assert.equal(poller.snapshot().lastError.message, 'network down');

  ticks.advance(30_000);
  body = { battles: [], updatedAt: CHECKED };
  await ticks.fireDue();
  assert.equal(poller.snapshot().sample.status, 'empty');
  assert.equal(poller.snapshot().sample.battle, null);
  assert.equal(poller.snapshot().lastError, null);

  const pending = ticks.pending();
  poller.setVisible(false);
  ticks.advance(120_000);
  await ticks.fireDue();
  assert.equal(calls.length, 3);
  assert.equal(ticks.pending().length, 0);
  assert.ok(pending.every((item) => item.cancelled));
  poller.stop();
});

test('hiding the tab during a check keeps the last good sample', async () => {
  const ticks = clock();
  let calls = 0;
  let rejectHang;
  const poller = createLiveBattlePoller({
    now: ticks.now,
    schedule: ticks.schedule,
    clearSchedule: ticks.clear,
    fetchImpl: (url, init) => {
      calls += 1;
      if (calls === 1) return jsonResponse(livePayload);
      return new Promise((resolve, reject) => {
        rejectHang = reject;
        init.signal.addEventListener('abort', () => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    },
  });
  poller.setVisible(true);
  await ticks.fireDue();
  assert.equal(poller.snapshot().sample.status, 'live');
  ticks.advance(30_000);
  const running = ticks.fireDue();
  poller.setVisible(false);
  await running;
  assert.equal(calls, 2);
  assert.equal(poller.snapshot().sample.status, 'live');
  assert.equal(poller.snapshot().lastError, null);
  assert.equal(poller.snapshot().inflight, false);
  rejectHang?.(new Error('late'));
  await Promise.resolve();
  assert.equal(poller.snapshot().sample.battle.battleId, 1784343368);
  poller.stop();
});

test('battle modules do not open a socket, a credentialed client, or a chain RPC', async () => {
  const names = ['observe.mjs', 'poll.mjs', 'overlay-v0.mjs', 'BattlePanel.jsx'];
  const source = (await Promise.all(names.map((name) => read(`../src/battle/${name}`)))).join('\n');
  assert.doesNotMatch(source, /WebSocket|supabase|wss:\/\/|solana|method:\s*['"]POST['"]/i);
  assert.match(source, /credentials:\s*'omit'/);
  assert.match(source, /live=true/);
});

test('shorter than 30 seconds is rejected by the poller', () => {
  assert.throws(() => createLiveBattlePoller({ intervalMs: 1000 }), /at least 30000ms/);
});
