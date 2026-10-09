import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { resolveProjectDir } from "../project-dir.ts";
import { tokenize } from "../tokenize.ts";
import type { Extractor, Identifier } from "../types.ts";

/** Conventional directories nobody names: they are never checked. */
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
  { isNew = true, isDir = false, root = resolveProjectDir() } = {},
): Identifier[] {
  const dirs = extractDirs(isDir ? filePath : dirname(filePath), filePath, root);
  const file = basename(filePath);
  if (isDir || !file || file.startsWith(".")) return dirs;
  return [...dirs, { name: file, kind: "file", file: filePath, isNew, segments: tokenize(file) }];
}

export const pathExtractor: Extractor = {
  test: () => true,
  extract: (filePath) => extractFromPath(filePath),
};

/** Make a tool path relative to the project. Paths outside the project are returned as-is. */
export function relativize(filePath: string, root = resolveProjectDir()): string {
  if (!isAbsolute(filePath)) return filePath;
  const relativePath = relative(root, filePath);
  return relativePath.startsWith("..") ? filePath : relativePath;
}

/** One identifier per directory on the path worth naming: conventional and dot dirs are skipped. */
function extractDirs(dirPath: string, filePath: string, root: string): Identifier[] {
  return listDirPrefixes(dirPath)
    .filter(({ dir }) => !SKIP_DIRS.has(dir) && !dir.startsWith("."))
    .map(({ dir, prefix }) => ({
      name: dir,
      kind: "dir",
      file: filePath,
      isNew: !existsSync(isAbsolute(prefix) ? prefix : join(root, prefix)),
      segments: tokenize(dir),
    }));
}

/** Each directory on the path, with the path up to it: that is what to look for on disk. */
function listDirPrefixes(dirPath: string) {
  const dirs = dirPath.split(sep);
  // A plain join, not path.join: path.join drops the leading separator of an absolute path.
  return dirs.map((dir, i) => ({ dir, prefix: dirs.slice(0, i + 1).join(sep) }));
}
