// Build the LockedIn extension into dist/: three TypeScript entry points plus
// the static manifest and popup page. `npm run build` runs this once.
import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const entryPoints = ["src/popup.ts", "src/service-worker.ts", "src/content-script.ts"];

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
  console.log("Extension built to dist/");
}
