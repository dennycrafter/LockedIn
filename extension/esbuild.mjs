// Build the LockedIn extension into dist/: every TypeScript entry point plus
// the static manifest and pages. `npm run build` runs this once.
import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const entryPoints = ["src/popup.ts", "src/service-worker.ts", "src/content-script.ts", "src/blocked.ts", "src/capture.ts"];

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints,
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: false,
  sourcemap: false,
  logLevel: "info",
};

mkdirSync("dist", { recursive: true });

if (process.argv.includes("--watch")) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(options);
  cpSync("src/manifest.json", "dist/manifest.json");
  cpSync("src/popup.html", "dist/popup.html");
  cpSync("src/blocked.html", "dist/blocked.html");
  cpSync("src/capture.html", "dist/capture.html");
  cpSync("src/icons", "dist/icons", { recursive: true });
  cpSync("src/assets", "dist/assets", { recursive: true });
  console.log("Extension built to dist/");
}
