#!/usr/bin/env node
// Biome ratchet: the lint count may only go DOWN.
//
// Runs `biome check <paths>` with the JSON reporter and compares the error and
// warning counts with `.lint-baseline.json`. Fails when either count is ABOVE
// the baseline (new debt) and also when it is BELOW (debt was paid, so the
// baseline must be lowered in the same change — otherwise the slack lets new
// debt back in unnoticed). Once a repo reaches zero, CI switches to
// `biome ci --error-on-warnings` and this file and the baseline are deleted.
//
// Why a script: biome exits 0 on warnings, so `biome check` alone let the
// count grow without anyone seeing it.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const baseline = JSON.parse(readFileSync(".lint-baseline.json", "utf8"));
const run = spawnSync(
  "node_modules/.bin/biome",
  ["check", ...baseline.paths, "--reporter=json", "--max-diagnostics=0"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

let summary;
try {
  summary = JSON.parse(run.stdout).summary;
} catch {
  console.error(`biome produced no JSON report (exit ${run.status}):\n${run.stderr}`);
  process.exit(2);
}

let failed = false;
for (const kind of ["errors", "warnings"]) {
  const now = summary[kind];
  const allowed = baseline[kind];
  if (now > allowed) {
    console.error(`✖ biome ${kind}: ${now} > baseline ${allowed}. Fix the new ones.`);
    failed = true;
  } else if (now < allowed) {
    console.error(`✖ biome ${kind}: ${now} < baseline ${allowed}. Lower "${kind}" in .lint-baseline.json to ${now}.`);
    failed = true;
  } else {
    console.log(`✓ biome ${kind}: ${now} (baseline ${allowed})`);
  }
}
if (failed) {
  console.error("Run `node_modules/.bin/biome check " + baseline.paths.join(" ") + "` to see them.");
  process.exit(1);
}
