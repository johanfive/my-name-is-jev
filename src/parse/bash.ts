import type { Identifier } from "../types.ts";
import { fromPath } from "./path.ts";

/** Split a command line on whitespace, honouring single and double quotes. No expansion. */
export function splitShellWords(command: string): string[] {
  const words = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return words.map((w) => w.replace(/^(["'])(.*)\1$/, "$2"));
}

/**
 * Paths introduced by name-creating commands:
 * mkdir, touch, git checkout -b, git switch -c, cp/mv destinations.
 */
export function fromBash(command: string): Identifier[] {
  const out: Identifier[] = [];
  // ponytail: split on separators naively; a `;` inside quotes is rare in agent commands.
  for (const part of command.split(/\s*(?:&&|\|\||;|\|)\s*/)) {
    const w = splitShellWords(part);
    if (!w.length) continue;
    const args = w.slice(1).filter((a) => !a.startsWith("-"));
    switch (w[0]) {
      case "mkdir":
        for (const p of args) out.push(...fromPath(p, { isDir: true }));
        break;
      case "touch":
        for (const p of args) out.push(...fromPath(p));
        break;
      case "cp":
      case "mv":
        if (args.length >= 2) out.push(...fromPath(args[args.length - 1]));
        break;
      case "git": {
        const i = w.findIndex(
          (x) => (w[1] === "checkout" && x === "-b") || (w[1] === "switch" && x === "-c"),
        );
        if (i > 0 && w[i + 1]) {
          out.push({
            name: w[i + 1],
            kind: "string",
            file: "<git-branch>",
            isNew: true,
            segments: w[i + 1].split(/[/\-_]+/),
          });
        }
        break;
      }
    }
  }
  return out;
}
