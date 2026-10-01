import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ResolvedConfig } from "./types.ts";

/** Where this OS expects a tool to keep its cache. */
const osCacheDir = () => {
  if (platform() === "darwin") return join(homedir(), "Library", "Caches", "nij");
  if (platform() === "win32") return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "nij");
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "nij");
};

/**
 * Most native location first: an explicit override, then the directory the coding agent gives its plugins (the adapter sets
 * `NIJ_CACHE_DIR` from it), then the JavaScript convention `node_modules/.cache` so the file dies with the project, then the OS
 * cache directory.
 */
export function resolveCacheDir(projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()): string {
  if (process.env.NIJ_CACHE_DIR) return process.env.NIJ_CACHE_DIR;
  const nodeModules = join(projectDir, "node_modules");
  if (existsSync(nodeModules)) return join(nodeModules, ".cache", "nij");
  return osCacheDir();
}

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
 * Bounded cache of Jev answers, one row per question. Pruned on open to `maxEntries` rows and `maxAgeDays` since last use,
 * so it can never grow past what the config allows. Returns null when the cache is disabled or the directory is unwritable.
 */
export function openCache(config: ResolvedConfig): AnswerCache | null {
  if (!config.cache.enabled) return null;
  const dir = resolveCacheDir();
  const file = join(dir, "cache.sqlite");
  let db: DatabaseSync;
  try {
    mkdirSync(dir, { recursive: true });
    db = new DatabaseSync(file);
    db.exec(`
      PRAGMA busy_timeout = 1000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS answers (key TEXT PRIMARY KEY, answer TEXT NOT NULL, last_used INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS answers_last_used ON answers (last_used);
    `);
    db.prepare("DELETE FROM answers WHERE last_used < ?").run(Date.now() - config.cache.maxAgeDays * 86_400_000);
    db.prepare("DELETE FROM answers WHERE key IN (SELECT key FROM answers ORDER BY last_used DESC LIMIT -1 OFFSET ?)").run(config.cache.maxEntries);
  } catch {
    return null; // read-only home or a broken file: run without a cache rather than fail
  }
  const select = db.prepare("SELECT answer FROM answers WHERE key = ?");
  const touch = db.prepare("UPDATE answers SET last_used = ? WHERE key = ?");
  const upsert = db.prepare("INSERT OR REPLACE INTO answers (key, answer, last_used) VALUES (?, ?, ?)");
  return {
    file,
    get: (key) => {
      const row = select.get(key) as { answer: string } | undefined;
      if (row) touch.run(Date.now(), key);
      return row?.answer;
    },
    set: (key, answer) => void upsert.run(key, answer, Date.now()),
    stats: () => ({ rows: (db.prepare("SELECT count(*) AS n FROM answers").get() as { n: number }).n, bytes: statSync(file).size }),
    clear: () => db.exec("DELETE FROM answers; VACUUM"),
  };
}
