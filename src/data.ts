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
};

/** What the data file holds, for `nij data`. */
export type DataSummary = { file: string; answers: number; findings: number; bytes: number };

/**
 * Bounded cache of Jev answers, one row per question, in the data file.
 * Pruned on open to `entriesMax` rows and `ageMaxDays` since last use,
 * so it can never grow past what the config allows.
 * Returns null when data is off or the directory is unwritable.
 */
export function openCache(config: ResolvedConfig): AnswerCache | null {
  const opened = openDataDb(config);
  return opened && createAnswerCache(opened.db, opened.file);
}

/**
 * The data file, pruned to the configured limits, for the answer cache and the findings log,
 * which share it. Null when data is off or the directory is unwritable.
 */
export function openDataDb(config: ResolvedConfig): { db: DatabaseSync; file: string } | null {
  if (!config.data.enabled) return null;
  const file = join(resolveDataDir(), "nij.sqlite");
  const db = openPrunedDb(file, config.data);
  return db && { db, file };
}

/** How full the data file is. Null when data is off or unreachable. */
export function inspectData(config: ResolvedConfig): DataSummary | null {
  const opened = openDataDb(config);
  if (!opened) return null;
  const count = (table: string) =>
    (opened.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
  return {
    file: opened.file,
    answers: count("answers"),
    findings: count("findings"),
    bytes: statSync(opened.file).size,
  };
}

/** Drop every answer and every finding. Returns the file cleared, or null when data is off. */
export function clearData(config: ResolvedConfig): string | null {
  const opened = openDataDb(config);
  if (!opened) return null;
  opened.db.exec("DELETE FROM answers; DELETE FROM findings; VACUUM");
  return opened.file;
}

/**
 * Most native location first:
 * an explicit override,
 * then the directory the coding agent gives its plugins (the adapter sets `NIJ_DATA_DIR` from it),
 * then the JavaScript convention `node_modules/.cache` so the file dies with the project,
 * then the OS data directory.
 */
export function resolveDataDir(projectDir = resolveProjectDir()): string {
  if (process.env.NIJ_DATA_DIR) return process.env.NIJ_DATA_DIR;
  const nodeModules = join(projectDir, "node_modules");
  if (existsSync(nodeModules)) return join(nodeModules, ".cache", "nij");
  return resolveOsDataDir();
}

/**
 * Open the data file and prune it to the configured limits.
 * Null on a read-only home or a broken file: nij runs without data rather than fail.
 */
function openPrunedDb(file: string, limits: ResolvedConfig["data"]): DatabaseSync | null {
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
 * and the findings recorded too long ago. This is what keeps the file bounded.
 */
function pruneDb(db: DatabaseSync, { entriesMax, ageMaxDays }: ResolvedConfig["data"]) {
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
  };
}

/**
 * Where this OS expects an application to keep its data.
 * The fallback for a project without node_modules.
 */
function resolveOsDataDir(): string {
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "nij");
  if (platform() === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "nij");
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "nij");
}
