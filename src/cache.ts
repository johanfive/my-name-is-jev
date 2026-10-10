import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveProjectDir } from "./project-dir.ts";
import type { ResolvedConfig } from "./types.ts";

const DAY_MS = 86_400_000;
const SCHEMA = `
  PRAGMA busy_timeout = 1000;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS answers
    (key TEXT PRIMARY KEY, answer TEXT NOT NULL, last_used INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS answers_last_used ON answers (last_used);
  CREATE TABLE IF NOT EXISTS findings (
    project TEXT NOT NULL, rule TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
    file TEXT NOT NULL, line INTEGER, session TEXT NOT NULL, outcome TEXT NOT NULL,
    recorded_at INTEGER NOT NULL,
    PRIMARY KEY (project, rule, kind, name, file)
  );
`;

export type AnswerCache = {
  file: string;
  get: (key: string) => string | undefined;
  set: (key: string, answer: string) => void;
  /** Row count and bytes on disk. */
  stats: () => { rows: number; bytes: number };
  /** Drop every row. */
  clear: () => void;
};

/**
 * Bounded cache of Jev answers, one row per question.
 * Pruned on open to `entriesMax` rows and `ageMaxDays` since last use,
 * so it can never grow past what the config allows.
 * Returns null when the cache is disabled or the directory is unwritable.
 */
export function openCache(config: ResolvedConfig): AnswerCache | null {
  const opened = openCacheDb(config);
  return opened && createAnswerCache(opened.db, opened.file);
}

/**
 * The cache database, pruned to the configured limits, for the answer cache and the findings
 * log, which share it. Null when the cache is disabled or the directory is unwritable.
 */
export function openCacheDb(config: ResolvedConfig): { db: DatabaseSync; file: string } | null {
  if (!config.cache.enabled) return null;
  const file = join(resolveCacheDir(), "cache.sqlite");
  const db = openPrunedDb(file, config.cache);
  return db && { db, file };
}

/**
 * Most native location first:
 * an explicit override,
 * then the directory the coding agent gives its plugins (the adapter sets `NIJ_CACHE_DIR` from it),
 * then the JavaScript convention `node_modules/.cache` so the file dies with the project,
 * then the OS cache directory.
 */
export function resolveCacheDir(projectDir = resolveProjectDir()): string {
  if (process.env.NIJ_CACHE_DIR) return process.env.NIJ_CACHE_DIR;
  const nodeModules = join(projectDir, "node_modules");
  if (existsSync(nodeModules)) return join(nodeModules, ".cache", "nij");
  return resolveOsCacheDir();
}

/**
 * Open the cache database and prune it to the configured limits.
 * Null on a read-only home or a broken file: nij runs without a cache rather than fail.
 */
function openPrunedDb(file: string, limits: ResolvedConfig["cache"]): DatabaseSync | null {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec(SCHEMA);
    pruneDb(db, limits);
    return db;
  } catch {
    return null;
  }
}

/**
 * Delete the answers unused for too long, then the least recently used past the row limit,
 * and the findings recorded too long ago. This is what keeps the database bounded.
 */
function pruneDb(db: DatabaseSync, { entriesMax, ageMaxDays }: ResolvedConfig["cache"]) {
  const oldest = Date.now() - ageMaxDays * DAY_MS;
  db.prepare("DELETE FROM answers WHERE last_used < ?").run(oldest);
  db.prepare("DELETE FROM findings WHERE recorded_at < ?").run(oldest);
  db.prepare(
    "DELETE FROM answers WHERE key IN "
    + "(SELECT key FROM answers ORDER BY last_used DESC LIMIT -1 OFFSET ?)",
  ).run(entriesMax);
}

/**
 * The cache's operations over an open database.
 * Statements are prepared once: the hook reads and writes one row per question.
 */
function createAnswerCache(db: DatabaseSync, file: string): AnswerCache {
  const select = db.prepare("SELECT answer FROM answers WHERE key = ?");
  const touch = db.prepare("UPDATE answers SET last_used = ? WHERE key = ?");
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO answers (key, answer, last_used) VALUES (?, ?, ?)",
  );
  return {
    file,
    get: (key) => {
      const row = select.get(key) as { answer: string } | undefined;
      if (row) touch.run(Date.now(), key);
      return row?.answer;
    },
    set: (key, answer) => void upsert.run(key, answer, Date.now()),
    stats: () => ({
      rows: (db.prepare("SELECT count(*) AS n FROM answers").get() as { n: number }).n,
      bytes: statSync(file).size,
    }),
    clear: () => db.exec("DELETE FROM answers; VACUUM"),
  };
}

/**
 * Where this OS expects a tool to keep its cache.
 * The fallback for a project without node_modules.
 */
function resolveOsCacheDir(): string {
  if (platform() === "darwin") return join(homedir(), "Library", "Caches", "nij");
  if (platform() === "win32") {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "nij");
  }
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "nij");
}
