import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Extractor, Identifier } from "../types.ts";
import { extractFromChange, type Change } from "./index.ts";

type NameStatus = { status: string; path: string; pathBefore?: string };

/**
 * The working tree under `root` as a git tree id: untracked files included, ignored files left out.
 * Written through a copy of the index, so the user's staging area is never touched.
 * Null outside a git repository or when git fails: nij then sees no change, and fails open.
 */
// ponytail: untracked files are hashed on every snapshot; cache their stats if big untracked
// files make Bash calls slow.
export function snapshotWorkingTree(root: string): string | null {
  const indexDir = mkdtempSync(join(tmpdir(), "nij-index-"));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(indexDir, "index") };
    const index = runGit(root, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "index",
    ]);
    if (existsSync(index.trim())) copyFileSync(index.trim(), env.GIT_INDEX_FILE);
    runGit(root, ["add", "--all"], env);
    return runGit(root, ["write-tree"], env).trim();
  } catch {
    return null;
  } finally {
    rmSync(indexDir, { recursive: true, force: true });
  }
}

/**
 * The identifiers of every file changed between two snapshots, `isNew` when the change
 * introduced them, whatever wrote them: a redirect, sed, a script or git mv.
 * Agents name things through the shell too.
 */
export function extractFromTreeDiff(
  root: string,
  treeBefore: string,
  treeAfter: string,
  extractors: Extractor[],
): Identifier[] {
  return listChanges(root, treeBefore, treeAfter).flatMap((change) => {
    const ids = extractFromChange(change, extractors);
    return markDirNewness(ids, change.path, (dirPath) => !hasPath(root, treeBefore, dirPath));
  });
}

/** Every file added, changed or renamed between the trees, with its content on both sides. */
function listChanges(root: string, treeBefore: string, treeAfter: string): Change[] {
  const output = runGit(root, [
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    "--relative",
    treeBefore,
    treeAfter,
  ]);
  return parseNameStatus(output.split("\0").filter(Boolean))
    .filter(({ status }) => status !== "D")
    .map(({ status, path, pathBefore }) => ({
      path,
      before: status === "A" ? null : readFile(root, treeBefore, pathBefore ?? path),
      after: readFile(root, treeAfter, path),
      isFileNew: status === "A" || status === "R" || status === "C",
    }));
}

/**
 * The entries of `git diff --name-status -z`: a status, then one path, or two for a rename or
 * copy (from, then to).
 */
function parseNameStatus(fields: string[]): NameStatus[] {
  const entries: NameStatus[] = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i][0];
    if (status === "R" || status === "C") {
      entries.push({ status, pathBefore: fields[i + 1], path: fields[i + 2] });
      i += 3;
    } else {
      entries.push({ status, path: fields[i + 1] });
      i += 2;
    }
  }
  return entries;
}

/**
 * The identifiers with each directory marked new when the tree before had no such directory.
 * The path extractor asks the disk, and after the command the disk always has it.
 * Directories come in path order, so each one is matched to the next path segment of its name.
 */
function markDirNewness(
  ids: Identifier[],
  filePath: string,
  isDirNew: (dirPath: string) => boolean,
): Identifier[] {
  const segments = filePath.split("/");
  let cursor = 0;
  return ids.map((id) => {
    if (id.kind !== "dir") return id;
    const index = segments.indexOf(id.name, cursor);
    cursor = index + 1;
    return { ...id, isNew: isDirNew(segments.slice(0, index + 1).join("/")) };
  });
}

/** The file's content in the tree. Paths are relative to `root`, as `--relative` gives them. */
function readFile(root: string, tree: string, path: string): string {
  return runGit(root, ["show", `${tree}:./${path}`]);
}

/** Whether the tree has a file or directory at the path. */
function hasPath(root: string, tree: string, path: string): boolean {
  try {
    runGit(root, [
      "cat-file",
      "-e",
      `${tree}:./${path}`,
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Git's output for the command run in `root`. Throws when git exits non-zero. */
function runGit(root: string, args: string[], env = process.env): string {
  return execFileSync("git", args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: [
      "ignore",
      "pipe",
      "ignore",
    ],
    maxBuffer: 64 * 1024 * 1024,
  });
}
