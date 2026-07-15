import { logger } from './logger.js';

type CollectFn = () => Promise<void>;

interface SchedulerState {
  intervalMs: number;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  lastRun: number | null;
}

const state: SchedulerState = {
  intervalMs: 6 * 60 * 60 * 1000, // 6 hours default
  timer: null,
  running: false,
  lastRun: null,
};

let collectFn: CollectFn | null = null;

/** Register the collect function to run on schedule. */
export function setCollectFn(fn: CollectFn): void {
  collectFn = fn;
}

/** Set the interval (in ms). */
export function setIntervalMs(ms: number): void {
  state.intervalMs = ms;
  if (state.timer) {
    stop();
    start();
  }
}

/** Start the scheduler. */
export function start(): void {
  if (state.timer) return;
  const tick = async () => {
    if (state.running) {
      logger.warn('system', 'scheduler', 'Previous collect still running, skipping');
      scheduleNext();
      return;
    }
    state.running = true;
    state.lastRun = Date.now();
    try {
      if (collectFn) await collectFn();
    } catch (err) {
      logger.error('system', 'scheduler', `Collect error: ${err}`);
    } finally {
      state.running = false;
      scheduleNext();
    }
  };

  const scheduleNext = () => {
    state.timer = setTimeout(tick, state.intervalMs);
  };

  scheduleNext();
}

/** Stop the scheduler. */
export function stop(): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

/** Manually trigger a collect run (respects the running lock). */
export async function triggerNow(): Promise<void> {
  if (state.running) {
    throw new Error('A collect run is already in progress');
  }
  state.running = true;
  state.lastRun = Date.now();
  try {
    if (collectFn) await collectFn();
  } finally {
    state.running = false;
  }
}

/** Check if a collect run is in progress. */
export function isRunning(): boolean {
  return state.running;
}

/** Get last run timestamp. */
export function getLastRun(): number | null {
  return state.lastRun;
}
