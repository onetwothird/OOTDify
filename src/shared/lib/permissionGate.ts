// System permission prompts (location, notifications) wait their turn: never
// on top of the full-screen welcome Penggi or the first-run onboarding, and
// one at a time so two system dialogs never stack. A screen or moment holds
// the prompts while it shows and releases them when it is done; a hold can
// be given a lifetime so a missed release can never block prompts for good.

const holds = new Map<string, ReturnType<typeof setTimeout> | null>();
let waiters: (() => void)[] = [];
let queue: Promise<unknown> = Promise.resolve();

export function holdPermissions(reason: string, maxMs?: number): void {
  const old = holds.get(reason);
  if (old) clearTimeout(old);
  holds.set(reason, maxMs ? setTimeout(() => releasePermissions(reason), maxMs) : null);
}

export function releasePermissions(reason: string): void {
  const timer = holds.get(reason);
  if (timer) clearTimeout(timer);
  holds.delete(reason);
  if (holds.size) return;
  const ready = waiters;
  waiters = [];
  ready.forEach((wake) => wake());
}

function whenClear(): Promise<void> {
  return holds.size ? new Promise((wake) => waiters.push(wake)) : Promise.resolve();
}

/** Runs `ask` once nothing holds the prompts and every earlier ask has finished. */
export function askInTurn<T>(ask: () => Promise<T>): Promise<T> {
  const turn = queue.then(async () => {
    await whenClear();
    return ask();
  });
  queue = turn.catch(() => {});
  return turn;
}
