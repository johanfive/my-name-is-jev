import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import type { Extractor, Identifier } from "../types.ts";
import { tokenize } from "../tokenize.ts";

const SKIP_DIRS = new Set([
  ".",
  "..",
  "",
  "node_modules",
  "src",
  "lib",
  "dist",
  "test",
  "tests",
  "__tests__",
]);

/** Make a tool path relative to the project. Paths outside the project are returned as-is. */
export function relativize(
  filePath: string,
  root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
): string {
  if (!isAbsolute(filePath)) return filePath;
  const rel = relative(root, filePath);
  return rel.startsWith("..") ? filePath : rel;
}

/**
 * File and directory names from a project-relative path.
 * The whole basename is the name:
 * a dot cannot tell an extension (`.test.ts`)
 * from a name part (`com.google.event`, `Dockerfile.theThing`),
 * so shape checks judge each dotted piece on its own
 * and Jev decides which words are file extensions.
 * A directory is new only if it does not exist on disk yet;
 * the file's newness is the caller's (`isNew`).
 */
export function extractFromPath(
  filePath: string,
  { isNew = true, isDir = false, root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd() } = {},
): Identifier[] {
  const out: Identifier[] = [];
  const dirs = isDir ? filePath.split(sep) : dirname(filePath).split(sep);
  let sofar = "";
  for (const dir of dirs) {
    sofar = sofar ? join(sofar, dir) : dir;
    if (SKIP_DIRS.has(dir) || dir.startsWith(".")) continue;
    out.push({
      name: dir,
      kind: "dir",
      file: filePath,
      isNew: !existsSync(isAbsolute(sofar) ? sofar : join(root, sofar)),
      segments: tokenize(dir),
    });
  }
  const file = basename(filePath);
  if (!isDir && file && !file.startsWith(".")) {
    out.push({ name: file, kind: "file", file: filePath, isNew, segments: tokenize(file) });
  }
  return out;
}

export const pathExtractor: Extractor = {
  test: () => true,
  extract: (filePath) => extractFromPath(filePath),
};
