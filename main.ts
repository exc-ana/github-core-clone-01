// github-core-clone-01 — entry lifecycle.
//
// The trial harness (env) owns port 8080 and drives the run. This file is the
// only bridge between the harness and the forge in app.ts: it starts the forge
// on a kernel-chosen port, tells the harness which port that is, then waits
// until the harness reports the trial finished and exits.
//
// Sequence, all of it ordinary HTTP against MAKEFUN_ENV_URL:
//   - no MAKEFUN_ENV_URL set: print to stderr and exit 1 immediately.
//   - start the forge with listen(0) so the kernel picks a free port.
//   - POST /register with {"port": N}; 200 registers us, 409 means another
//     entry already holds the slot (both are fine — keep waiting).
//     400/405 are contract errors and abort the process; anything else is
//     retried, because the harness may still be coming up.
//   - GET /done in a loop until the body reads {"done": true}; every failed
//     or inconclusive poll is retried after a short backoff.
//   - close the forge and exit 0. Nothing here prints a verdict — the
//     harness writes the export the scorer reads.

import { createApp } from './app.ts';

// The harness origin, e.g. http://store:8080 inside a trial container.
const HARNESS = (process.env.MAKEFUN_ENV_URL ?? '').replace(/\/+$/, '');

if (HARNESS === '') {
  process.stderr.write('[entry] MAKEFUN_ENV_URL is not set: there is no env to register with\n');
  process.exit(1);
}

// One HTTP round trip may take at most this long before it is abandoned.
const ROUND_TRIP_MS = 30_000;
// Retry spacing starts here and doubles, never passing the cap.
const BACKOFF_START_MS = 250;
const BACKOFF_CAP_MS = 2_000;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wait after the nth failed attempt: 250, 500, 1000, 2000, 2000, ...
function backoffMs(attempt: number): number {
  const step = Math.min(attempt, 8);
  return Math.min(BACKOFF_CAP_MS, BACKOFF_START_MS * 2 ** step);
}

// Tell the harness which port the forge bound. Returns once the harness has
// the registration (200) or another entry already registered (409).
async function announce(port: number): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${HARNESS}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ port }),
        signal: AbortSignal.timeout(ROUND_TRIP_MS),
      });
    } catch {
      // The harness is unreachable for now; wait and try the register again.
      await pause(backoffMs(attempt));
      continue;
    }
    if (response.status === 200 || response.status === 409) return;
    if (response.status === 400 || response.status === 405) {
      throw new Error(`register answered HTTP ${response.status}: ${await response.text()}`);
    }
    await pause(backoffMs(attempt));
  }
}

// Ask the harness whether the trial is over; only {"done": true} ends the wait.
async function awaitDone(): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(`${HARNESS}/done`, {
        signal: AbortSignal.timeout(ROUND_TRIP_MS),
      });
      if (response.ok) {
        const payload = (await response.json()) as { done?: unknown };
        if (payload.done === true) return;
      }
    } catch {
      // No answer, a timeout, or an unreadable body: not done yet.
    }
    await pause(backoffMs(attempt));
  }
}

// Start the forge, register its port, wait for done, shut down.
async function run(): Promise<void> {
  const server = createApp();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => resolve());
  });
  const bound = server.address();
  if (bound === null || typeof bound === 'string') {
    throw new Error('the server did not bind an ephemeral TCP port');
  }
  process.stdout.write(`[entry] listening on port ${bound.port}\n`);

  await announce(bound.port);
  process.stdout.write('[entry] registered; waiting for the env to say done\n');

  await awaitDone();
  server.close();
  process.stdout.write('[entry] done\n');
}

try {
  await run();
  process.exit(0);
} catch (err) {
  process.stderr.write(`[entry] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
