#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../src/config.ts";
import { tokenize } from "../src/tokenize.ts";
import { createJev, judgeCtx, resolveProjectDir } from "../src/jev-client.ts";
import { fromPath } from "../src/parse/path.ts";
import { run, selects } from "../src/pipeline.ts";
import { formatFinding } from "../src/report.ts";
import type { Identifier, Kind } from "../src/types.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    kind: { type: "string", short: "k", default: "variable" },
    file: { type: "string", short: "f", default: "src/example.ts" },
  },
});
const [command, ...rest] = positionals;

// The CLI is a developer tool, so the project's .env is fair game.
// The hook never reads it: its key comes from the agent.
try {
  process.loadEnvFile(join(resolveProjectDir(), ".env"));
} catch {
  /* no .env, fine */
}

const config = await loadConfig();
const jev = createJev(config, (_state, _questions, answers, cached) => {
  const nums = Object.entries(answers).map(
    ([k, a]) => {
      const v =
        a.type === "noul" ? a.noul.toFixed(2) : a.type === "score" ? a.score.toFixed(2) : a.choice;
      return `${k}=${v}`;
    },
  );
  console.log(`  jev${cached ? " (cached)" : ""}: ${nums.join(" ")}`);
});
const ctxFor = (all: Identifier[]) =>
  jev
  && ((id: Identifier) =>
    judgeCtx(
      jev,
      id,
      all.filter((o) => o !== id),
    ));

if (command === "explain" && rest[0]) {
  console.log(jev?.describe() ?? "jev: none");
  console.log(`config: ${config.sources.join(" + ") || "none"}`);
  const id: Identifier | undefined =
    values.kind === "file"
      ? fromPath(rest[0]).at(-1)
      : {
          name: rest[0],
          kind: values.kind as Kind,
          file: values.file!,
          isNew: true,
          segments: tokenize(rest[0]),
        };
  if (!id) {
    console.log(`${rest[0]}: nothing to check (dotfiles are skipped)`);
    process.exit(0);
  }
  console.log(`${id.name} → ${JSON.stringify(id.segments)} as ${id.kind}`);
  const findings = await run(config.rules, [id], ctxFor([id]));
  const checkFailed = findings.some((f) => f.rule.check);
  for (const rule of config.rules) {
    if (!selects(rule.select, id)) continue;
    const f = findings.find((x) => x.rule === rule);
    if (f) console.log(`✗ ${rule.id}: ${f.verdict.detail ?? ""}`);
    else if (rule.judge && (checkFailed || !jev)) {
      console.log(`– ${rule.id}: skipped (${jev ? "a check failed" : "no Jev"})`);
    } else console.log(`✓ ${rule.id}`);
  }
} else if (command === "check" && rest.length) {
  let blocked = false;
  for (const file of rest) {
    const content = readFileSync(file, "utf8");
    const ids = config.extractors
      .filter((x) => x.test(file))
      .flatMap((x) => x.extract(file, content));
    for (const f of await run(config.rules, ids, ctxFor(ids))) {
      const sev = f.rule.severity ?? config.severity;
      blocked ||= sev === "block";
      console.log(`${sev.toUpperCase().padEnd(5)} ${formatFinding(f)}`);
    }
  }
  process.exitCode = blocked ? 1 : 0;
} else if (command === "cache") {
  const cache = jev?.cache ?? null;
  if (!cache) console.log("cache: off");
  else if (rest[0] === "clear") {
    cache.clear();
    console.log(`cache cleared: ${cache.file}`);
  } else {
    const { rows, bytes } = cache.stats();
    console.log(cache.file);
    console.log(
      `${rows} answers, ${(bytes / 1024).toFixed(0)} KiB, `
      + `max ${config.cache.maxEntries} answers / ${config.cache.maxAgeDays} days since last use`,
    );
  }
} else {
  console.log(
    "usage: nij explain <name> [--kind k] [--file p]\n"
    + "       nij check <files...>\n"
    + "       nij cache [clear]",
  );
  process.exitCode = 2;
}
