#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { AnswerCache } from "../src/cache.ts";
import { loadConfig } from "../src/config.ts";
import { createJev, createJudgeCtxFor, type Jev } from "../src/jev-client.ts";
import { extractFromPath } from "../src/parse/path.ts";
import { runRules, selects } from "../src/pipeline.ts";
import { resolveProjectDir } from "../src/project-dir.ts";
import { formatFinding, severityOf } from "../src/report.ts";
import { tokenize } from "../src/tokenize.ts";
import type {
  Answers,
  Finding,
  Identifier,
  Kind,
  ResolvedConfig,
  Rule,
} from "../src/types.ts";

const USAGE =
  "usage: nij explain <name> [--kind k] [--file p]\n"
  + "       nij check <files...>\n"
  + "       nij cache [clear]";

await main();

/** Parse the command line and run the command it names. */
async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      kind: { type: "string", short: "k", default: "variable" },
      file: { type: "string", short: "f", default: "src/example.ts" },
    },
  });
  const [command, ...operands] = positionals;
  loadDotEnv();
  const config = await loadConfig();
  const jev = createJev(config, printTrace);

  if (command === "explain" && operands[0]) {
    await explain(operands[0], values.kind as Kind, values.file!, config, jev);
  } else if (command === "check" && operands.length) await check(operands, config, jev);
  else if (command === "cache") showCache(operands[0], config, jev?.cache ?? null);
  else {
    console.log(USAGE);
    process.exitCode = 2;
  }
}

/**
 * Load the project's .env, if there is one.
 * The CLI is a developer tool, so the project's .env is fair game.
 * The hook never reads it: its key comes from the agent.
 */
function loadDotEnv() {
  try {
    process.loadEnvFile(join(resolveProjectDir(), ".env"));
  } catch {
    /* no .env, fine */
  }
}

/**
 * Show how every rule sees one name: passed, failed, or skipped and why.
 * For tuning rules and judges without an agent in the loop.
 */
async function explain(
  name: string,
  kind: Kind,
  file: string,
  config: ResolvedConfig,
  jev: Jev | null,
) {
  console.log(jev?.describe() ?? "jev: none");
  console.log(`config: ${config.sources.join(" + ") || "none"}`);
  const id = toIdentifier(name, kind, file);
  if (!id) {
    console.log(`${name}: nothing to check (dotfiles are skipped)`);
    return;
  }
  console.log(`${id.name} → ${JSON.stringify(id.segments)} as ${id.kind}`);
  const findings = await runRules(config.rules, [id], createJudgeCtxFor(jev, [id]));
  const checkFailed = findings.some((finding) => finding.rule.check);
  for (const rule of config.rules.filter((rule) => selects(rule.select, id))) {
    console.log(describeOutcome(rule, findings, checkFailed, jev !== null));
  }
}

/**
 * The name as the parsers would give it.
 * A file goes through the path parser; undefined for a dotfile, which is never checked.
 */
function toIdentifier(name: string, kind: Kind, file: string): Identifier | undefined {
  if (kind === "file") return extractFromPath(name).at(-1);
  return { name, kind, file, isNew: true, segments: tokenize(name) };
}

/** One rule's line in `explain`: ✗ with the detail, – skipped with the reason, or ✓. */
function describeOutcome(rule: Rule, findings: Finding[], checkFailed: boolean, hasJev: boolean) {
  const finding = findings.find((finding) => finding.rule === rule);
  if (finding) return `✗ ${rule.id}: ${finding.verdict.detail ?? ""}`;
  if (rule.judge && (checkFailed || !hasJev)) {
    return `– ${rule.id}: skipped (${hasJev ? "a check failed" : "no Jev"})`;
  }
  return `✓ ${rule.id}`;
}

/**
 * Print every finding in the files, and exit 1 when one blocks.
 * Every declaration counts as new, so CI and pre-commit hooks can check whole files.
 */
async function check(files: string[], config: ResolvedConfig, jev: Jev | null) {
  let blocked = false;
  for (const file of files) {
    const findings = await checkFile(file, config, jev);
    for (const finding of findings) printFinding(finding, config);
    blocked ||= findings.some((finding) => severityOf(finding, config) === "block");
  }
  process.exitCode = blocked ? 1 : 0;
}

/** Every finding in one file, from the extractors that handle it. */
async function checkFile(file: string, config: ResolvedConfig, jev: Jev | null) {
  const content = readFileSync(file, "utf8");
  const identifiers = config.extractors
    .filter((extractor) => extractor.test(file))
    .flatMap((extractor) => extractor.extract(file, content));
  return runRules(config.rules, identifiers, createJudgeCtxFor(jev, identifiers));
}

/** One finding, led by its severity so a reader can scan for blockers. */
function printFinding(finding: Finding, config: ResolvedConfig) {
  const severity = severityOf(finding, config);
  console.log(`${severity.toUpperCase().padEnd(5)} ${formatFinding(finding)}`);
}

/** Show where the answer cache lives and how full it is, or clear it. */
function showCache(
  subcommand: string | undefined,
  config: ResolvedConfig,
  cache: AnswerCache | null,
) {
  if (!cache) console.log("cache: off");
  else if (subcommand === "clear") {
    cache.clear();
    console.log(`cache cleared: ${cache.file}`);
  } else {
    const { rows, bytes } = cache.stats();
    console.log(cache.file);
    console.log(
      `${rows} answers, ${(bytes / 1024).toFixed(0)} KiB, `
      + `max ${config.cache.entriesMax} answers / ${config.cache.ageMaxDays} days since last use`,
    );
  }
}

/** Print each Jev answer as it arrives, so `explain` shows the numbers behind a verdict. */
function printTrace(_state: unknown, _questions: unknown, answers: Answers, cached: boolean) {
  const pairs = Object.entries(answers).map(([key, answer]) => `${key}=${formatAnswer(answer)}`);
  console.log(`  jev${cached ? " (cached)" : ""}: ${pairs.join(" ")}`);
}

/** An answer as its number to two decimals, or its choice. */
function formatAnswer(answer: Answers[string]) {
  if (answer.type === "noul") return answer.noul.toFixed(2);
  if (answer.type === "score") return answer.score.toFixed(2);
  return answer.choice;
}
