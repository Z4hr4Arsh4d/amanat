// P2 owns. Background worker: `npm run worker`. All timer state lives in the DB,
// so stopping/restarting this process never loses or duplicates an escalation (Q5).
import { JOBS } from "./registry";

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 2000);
let running = false;

async function tick() {
  if (running) return; // never overlap ticks inside one process
  running = true;
  for (const job of JOBS) {
    try {
      await job.run();
    } catch (e) {
      console.error(`[worker] ${job.name} failed:`, e); // one failing job never stops the others (I5.8)
    }
  }
  running = false;
}

console.log(`[worker] started, ${JOBS.length} jobs, tick ${TICK_MS}ms`);
setInterval(tick, TICK_MS);
tick();
