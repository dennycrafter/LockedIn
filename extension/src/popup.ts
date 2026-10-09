// Popup for the LockedIn extension. Ticket T1 turns this into the
// connection panel (status, time left, Dashboard URL field).
const version = document.getElementById("version");
if (version) {
  version.textContent = `v${chrome.runtime.getManifest().version}`;
}
