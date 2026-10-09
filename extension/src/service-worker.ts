// LockedIn service worker. MV3 workers sleep, so from ticket T1 all live
// session state lives in chrome.storage.local and timers use chrome.alarms.
// Ticket T0 ships the skeleton so the build pipeline is proven.
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`LockedIn extension ${details.reason}`);
});
