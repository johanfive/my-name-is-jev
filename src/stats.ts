import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FindingRecord } from "./findings-log.ts";
import type { Extractor } from "./types.ts";

/**
 * What became of a flagged name: still there, no longer there, or its file is gone.
 * A file or directory that is no longer there counts as renamed: the name was the finding,
 * and a rename is what makes the path vanish.
 */
export type Fate = "kept" | "renamed" | "gone";
export type RuleStats = { rule: string; kept: number; renamed: number; gone: number };

/**
 * Per rule, how many flagged names were renamed, kept or lost with their file,
 * for the project at `root`. This is the measure of whether a rule's findings are acted on.
 */
export function computeStats(
  records: FindingRecord[],
  root: string,
  extractors: Extractor[],
): RuleStats[] {
  const statsByRule = new Map<string, RuleStats>();
  for (const record of records) {
    const fresh = { rule: record.rule, kept: 0, renamed: 0, gone: 0 };
    const stats = statsByRule.get(record.rule) ?? fresh;
    stats[assessFate(record, root, extractors)] += 1;
    statsByRule.set(record.rule, stats);
  }
  return [...statsByRule.values()];
}

/** Whether the flagged name is still in its file, as the extractors would read it today. */
function assessFate(record: FindingRecord, root: string, extractors: Extractor[]): Fate {
  if (record.kind === "dir") return existsSync(resolveDirPath(record, root)) ? "kept" : "renamed";
  const absolutePath = join(root, record.file);
  if (!existsSync(absolutePath)) return record.kind === "file" ? "renamed" : "gone";
  if (record.kind === "file") return "kept";
  const content = readFileSync(absolutePath, "utf8");
  const isPresent = extractors
    .filter((extractor) => extractor.test(record.file))
    .flatMap((extractor) => extractor.extract(record.file, content))
    .some((id) => id.kind === record.kind && id.name === record.name);
  return isPresent ? "kept" : "renamed";
}

/** The path of a flagged directory: its file's path, cut after the directory's name. */
function resolveDirPath(record: FindingRecord, root: string): string {
  const segments = dirname(record.file).split("/");
  const index = segments.lastIndexOf(record.name);
  return join(root, ...segments.slice(0, index + 1));
}
