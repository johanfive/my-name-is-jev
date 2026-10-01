// Copies the package.json version into every agent manifest. Runs as the `version` npm script,
// and in the release workflow to catch a manifest left behind.
import { readFileSync, writeFileSync } from "node:fs";

// One entry per supported agent.
const manifests = [".claude-plugin/plugin.json"];

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
for (const path of manifests) {
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.version = version;
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
}
