import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CaseStyle } from "./matches-case.ts";
import { matchesCase } from "./matches-case.ts";
import type { Identifier } from "../../types.ts";

const fakeIdentifier = (name: string): Identifier =>
  ({ name, kind: "variable", file: "src/fake.ts", isNew: true, segments: [] });

const verdictCases: { style: CaseStyle; name: string; expected: unknown }[] = [
  { style: "camel", name: "fetchUser", expected: { ok: true } },
  { style: "camel", name: "_fetchUser", expected: { ok: true } },
  { style: "camel", name: "fetch_user", expected: { ok: false, detail: "not camel case" } },
  { style: "pascal", name: "UserCache", expected: { ok: true } },
  { style: "pascal", name: "userCache", expected: { ok: false, detail: "not pascal case" } },
  { style: "kebab", name: "user-cache.test.ts", expected: { ok: true } },
  {
    style: "kebab",
    name: "user_cache.test.ts",
    expected: { ok: false, detail: "\"user_cache\" is not kebab case" },
  },
  { style: "snake", name: "user_cache", expected: { ok: true } },
  { style: "screaming", name: "RETRY_COUNT_MAX", expected: { ok: true } },
  { style: "screaming", name: "Retry_Max", expected: { ok: false, detail: "not screaming case" } },
];

describe("matchesCase", () => {
  for (const { style, name, expected } of verdictCases) {
    test(`judges ${name} as ${style} case`, () => {
      const verdict = matchesCase(style)(fakeIdentifier(name), { siblings: [] });
      assert.deepEqual(verdict, expected);
    });
  }
});
