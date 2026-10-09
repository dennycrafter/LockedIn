// LockedIn content script. Two jobs from ticket T1: on the dashboard origin it
// bridges window.postMessage to the service worker, and on every other page it
// draws the floating timer. Ticket T0 ships the no-op so the script pipeline
// is proven end to end.
export {};
