// Structural check for the built extension. Fails with exit 1 when dist/ is
// not a loadable Manifest V3 skeleton, so CI and local builds stay honest.
import { existsSync, readFileSync } from "node:fs";

const manifestPath = "dist/manifest.json";
const errors = [];

if (!existsSync(manifestPath)) {
  console.error(`FAIL: ${manifestPath} not found. Run the build first.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest.manifest_version !== 3) {
  errors.push("manifest_version must be 3");
}
if (typeof manifest.name !== "string" || manifest.name.length === 0) {
  errors.push("manifest.name must be set");
}
if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  errors.push("manifest.version must be semver");
}
if (manifest.background?.service_worker !== "service-worker.js") {
  errors.push("background.service_worker must point at service-worker.js");
}
if (manifest.action?.default_popup !== "popup.html") {
  errors.push("action.default_popup must point at popup.html");
}
const contentScript = manifest.content_scripts?.[0];
if (!contentScript || !contentScript.matches?.includes("<all_urls>")) {
  errors.push("content_scripts[0].matches must include <all_urls>");
}
// T1: the DNR redirect needs the block page reachable from any page.
const war = manifest.web_accessible_resources?.[0];
if (!war || !war.resources?.includes("blocked.html") || !war.matches?.includes("<all_urls>")) {
  errors.push("web_accessible_resources[0] must expose blocked.html to <all_urls>");
}
const dnrPermissions = ["declarativeNetRequest", "declarativeNetRequestWithHostAccess"];
for (const permission of dnrPermissions) {
  if (!manifest.permissions?.includes(permission)) {
    errors.push(`permissions must include ${permission}`);
  }
}
if (!manifest.host_permissions?.includes("<all_urls>")) {
  errors.push("host_permissions must include <all_urls>");
}

const referencedFiles = [
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  ...(contentScript?.js ?? []),
  ...(war?.resources ?? []),
].filter((f) => typeof f === "string");

for (const file of referencedFiles) {
  if (!existsSync(`dist/${file}`)) {
    errors.push(`manifest references ${file} but dist/${file} is missing`);
  }
}

// Every page shipped in dist must resolve its own script/link references:
// blocked.html is reached via redirect, not the manifest, so a missing bundle
// (e.g. blocked.js) only surfaces here.
for (const page of ["popup.html", "blocked.html"].filter((f) => existsSync(`dist/${f}`))) {
  const html = readFileSync(`dist/${page}`, "utf8");
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const ref = match[1];
    if (!ref || /^(https?:)?\/\//.test(ref) || ref.startsWith("data:")) continue;
    const local = ref.replace(/^\//, "");
    if (!existsSync(`dist/${local}`)) {
      errors.push(`${page} references ${ref} but dist/${local} is missing`);
    }
  }
}

if (errors.length > 0) {
  console.error(`FAIL: extension dist is not a valid MV3 skeleton:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
}

console.log(`OK: ${manifest.name} v${manifest.version}, manifest_version 3, all referenced files present:`);
for (const file of ["manifest.json", ...referencedFiles]) {
  console.log(`  dist/${file}`);
}
