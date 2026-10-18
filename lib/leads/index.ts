// P2 owns. STUBS — replace bodies (PLAN.md §3). Signatures are CONTRACTS.

/** Create a lead for a contact and assign it immediately. Called by the web form, manual entry and P3's WhatsApp webhook. */
export { intake } from "./intake";

/** Any recorded action on a contact (note, message, stage change, appointment, call) counts as acknowledgement of that user's open lead. */
export { markActed } from "./acknowledge";

/** Explicit Acknowledge click (web or Telegram button). */
export { acknowledge } from "./acknowledge";

/** Called by setStatus() when someone goes On leave / Offline (F3.6). */
export { handleAbsence } from "./absence";

export { setStatus } from "./availability";

/** Manual reassign (needs the leads.reassign permission, checked by the caller). */
export { reassign } from "./reassign";
export { escalate, escalationSweep } from "./escalate";
