// P3 owns. Fault lab "provider outage" executor. Worker-safe (no server-only imports): the worker retries it.
import { registerExecutor, TemporaryError } from "./outbox";

// Always down: shows retries (5s, 15s, 45s) and then a plain failure, while everything else keeps working (I5.5, I5.8).
registerExecutor("fault.outage", {
  async run() {
    throw new TemporaryError("Simulated outage: the provider did not answer (fault lab test).", "503");
  },
});
