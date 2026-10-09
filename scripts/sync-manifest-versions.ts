// Copies the package.json version into every agent manifest. Runs as the `version` npm script,
// and in the release workflow to catch a manifest left behind.
import { readFileSync, writeFileSync } from "node:fs";

// One entry per supported agent.
const MANIFEST_PATHS = [".claude-plugin/plugin.json"];

syncManifestVersions();

/** Give every manifest the package's version. Claude Code reads the version from its manifest. */
function syncManifestVersions() {
  const { version } = readJson("package.json");
  for (const path of MANIFEST_PATHS) writeJson(path, { ...readJson(path), version });
}

/** The parsed JSON file. */
function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Write the value as JSON, two-space indented with a final newline, the way npm writes JSON. */
function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
