/**
 * Regression checks for checkDraft. Not bundled into the Docs tab (.mjs).
 * Confirms slurs / hate-speech vocabulary pass, and the keep-blocked
 * FUD / ticker / CA / wallet / URL / shill rules still fire.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runner = join(root, "scripts", "assert-draft-rules.runner.mts");

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--no-warnings", runner],
  { cwd: root, encoding: "utf8" },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);
