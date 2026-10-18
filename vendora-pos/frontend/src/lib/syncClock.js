// Server-corrected clock for merge-deciding timestamps.
//
// Item `updatedAt` (who wins a per-item merge) and delete-tombstone `at` are generated on the device. A phone
// whose clock runs fast would therefore ALWAYS win merges and its tombstones would delete genuinely newer
// edits from other devices. To stop that, we learn the server's wall-clock from the `Date` response header on
// every sync call and stamp those timestamps with a corrected `now()` instead of the raw device clock.
//
// Coarse by design (the Date header has ~1s resolution) — that's plenty to neutralise clock skew, which is a
// minutes-to-hours problem. Before the first sync the offset is 0, so `now()` is just `Date.now()`.
let offsetMs = 0;

/** Record the server's clock from a response `Date` header and update the offset (server − device). */
export function noteServerDate(dateHeader) {
  if (!dateHeader) return;
  const serverMs = Date.parse(dateHeader);
  if (!Number.isFinite(serverMs)) return;
  offsetMs = serverMs - Date.now();
}

/** Current time corrected toward the server's clock. Use for merge `updatedAt` and tombstone `at`. */
export function now() { return Date.now() + offsetMs; }

/** The learned offset (server − device) in ms, for diagnostics/tests. */
export function clockOffset() { return offsetMs; }

/** Test hook: reset the learned offset. */
export function __resetClock() { offsetMs = 0; }
