import { parseLiveBattleResponse } from './observe.mjs';

export const LIVE_BATTLES_URL = 'https://wavewarz.info/api/public/battles?live=true';
export const MIN_POLL_INTERVAL_MS = 30_000;
const RESPONSE_LIMIT = 1_000_000;

export function initialPollState() {
  return { visible: false, inflight: false, lastAttemptAt: null, sample: null, lastError: null };
}

export function pollDelay(state, nowMs, intervalMs = MIN_POLL_INTERVAL_MS) {
  if (!state?.visible || state.inflight) return null;
  if (state.lastAttemptAt == null) return 0;
  return Math.max(intervalMs - (nowMs - state.lastAttemptAt), 0);
}

export function reducePoll(state, event) {
  switch (event?.type) {
    case 'visibility':
      return { ...state, visible: event.visible === true, inflight: event.visible === true ? state.inflight : false };
    case 'attempt-start':
      if (!state.visible || state.inflight) return state;
      return { ...state, inflight: true, lastAttemptAt: event.nowMs };
    case 'attempt-success':
      return { ...state, inflight: false, sample: event.sample, lastError: null };
    case 'attempt-failure':
      return {
        ...state,
        inflight: false,
        sample: state.sample,
        lastError: { message: event.message || 'Live battle check failed.', at: event.checkedAt },
      };
    case 'attempt-abort':
      return { ...state, inflight: false };
    default:
      return state;
  }
}

export function createLiveBattlePoller({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  intervalMs = MIN_POLL_INTERVAL_MS,
  url = LIVE_BATTLES_URL,
  schedule = (fn, ms) => setTimeout(fn, ms),
  clearSchedule = (id) => clearTimeout(id),
  onChange = () => {},
} = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < MIN_POLL_INTERVAL_MS) {
    throw new Error(`Battle poll interval must be at least ${MIN_POLL_INTERVAL_MS}ms.`);
  }
  let state = initialPollState();
  let timer = null;
  let disposed = false;
  let controller = null;
  let token = 0;

  const snapshot = () => ({
    visible: state.visible,
    inflight: state.inflight,
    sample: state.sample,
    lastError: state.lastError,
  });

  function emit() {
    onChange(snapshot());
  }

  function clearTimer() {
    if (timer != null) clearSchedule(timer);
    timer = null;
  }

  function arm() {
    clearTimer();
    if (disposed) return;
    const delay = pollDelay(state, now(), intervalMs);
    if (delay == null) return;
    timer = schedule(() => {
      timer = null;
      return attempt();
    }, delay);
  }

  async function attempt() {
    if (disposed || state.inflight || !state.visible) return;
    const attemptToken = ++token;
    const started = now();
    state = reducePoll(state, { type: 'attempt-start', nowMs: started });
    emit();
    const abort = new AbortController();
    controller = abort;
    const checkedAt = new Date(started).toISOString();
    try {
      const response = await fetchImpl(url, { signal: abort.signal, credentials: 'omit' });
      if (attemptToken !== token || disposed) return;
      if (!response?.ok) throw new Error(`WaveWarz battles returned ${response?.status ?? 'an error'}.`);
      const body = await response.text();
      if (typeof body !== 'string' || body.length > RESPONSE_LIMIT) throw new Error('Live battle response exceeded the studio limit.');
      const sample = parseLiveBattleResponse(JSON.parse(body), { checkedAt });
      if (attemptToken !== token || disposed) return;
      state = reducePoll(state, { type: 'attempt-success', sample });
    } catch (error) {
      if (attemptToken !== token || disposed) return;
      if (error?.name === 'AbortError') state = reducePoll(state, { type: 'attempt-abort' });
      else state = reducePoll(state, { type: 'attempt-failure', message: error?.message || 'Live battle check failed.', checkedAt });
    } finally {
      if (controller === abort) controller = null;
      if (attemptToken === token && !disposed) {
        emit();
        arm();
      }
    }
  }

  return {
    setVisible(visible) {
      if (disposed) return;
      const next = visible === true;
      if (state.visible === next) return;
      if (!next) {
        token += 1;
        controller?.abort();
        controller = null;
        clearTimer();
        state = reducePoll(state, { type: 'visibility', visible: false });
        emit();
        return;
      }
      state = reducePoll(state, { type: 'visibility', visible: true });
      emit();
      arm();
    },
    stop() {
      disposed = true;
      token += 1;
      controller?.abort();
      controller = null;
      clearTimer();
    },
    snapshot,
  };
}
