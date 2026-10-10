import type { DatabaseSync } from "node:sqlite";
import { openDataDb } from "./data.ts";
import type { Outcome } from "./report.ts";
import type { Finding, Kind, ResolvedConfig } from "./types.ts";

/** One flagged name, as the log keeps it. */
export type FindingRecord = {
  project: string;
  rule: string;
  kind: Kind;
  name: string;
  file: string;
  line: number | null;
  session: string;
  outcome: Outcome;
  recordedAt: number;
};

export type FindingsLog = {
  /** Keep the records; a name flagged again by the same rule replaces its earlier record. */
  record: (records: FindingRecord[]) => void;
  /** Every record of the project, oldest first. */
  list: (project: string) => FindingRecord[];
};

/**
 * The log of what nij flagged, in the data file, so `nij stats` can tell which names
 * were renamed and which were kept. Null when data is off: no Jev answers on disk means
 * no record of names either.
 */
export function openFindingsLog(config: ResolvedConfig): FindingsLog | null {
  const opened = openDataDb(config);
  return opened && createFindingsLog(opened.db);
}

/** The findings of one tool call as records, all with the same session and outcome. */
export function toFindingRecords(
  findings: Finding[],
  { project, session, outcome }: { project: string; session: string; outcome: Outcome },
): FindingRecord[] {
  return findings.map(({ rule, identifier }) => ({
    project,
    rule: rule.id,
    kind: identifier.kind,
    name: identifier.name,
    file: identifier.file,
    line: identifier.line ?? null,
    session,
    outcome,
    recordedAt: Date.now(),
  }));
}

/** The log's operations over an open database. */
function createFindingsLog(db: DatabaseSync): FindingsLog {
  const upsert = db.prepare(
    "INSERT OR REPLACE INTO findings "
    + "(project, rule, kind, name, file, line, session, outcome, recorded_at) "
    + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const select = db.prepare(
    "SELECT project, rule, kind, name, file, line, session, outcome, recorded_at AS recordedAt "
    + "FROM findings WHERE project = ? ORDER BY recorded_at",
  );
  return {
    record: (records) => {
      for (const record of records) {
        upsert.run(
          record.project,
          record.rule,
          record.kind,
          record.name,
          record.file,
          record.line,
          record.session,
          record.outcome,
          record.recordedAt,
        );
      }
    },
    // Rows come back without a prototype; plain copies compare and spread like any object.
    list: (project) => select.all(project).map((row) => ({ ...row })) as FindingRecord[],
  };
}
