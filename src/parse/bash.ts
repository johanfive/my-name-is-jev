import type { Identifier } from "../types.ts";
import { extractFromPath } from "./path.ts";

// ponytail: split on separators naively; a `;` inside quotes is rare in agent commands.
const COMMAND_SEPARATOR = /\s*(?:&&|\|\||;|\|)\s*/;
const BRANCH_FLAG_BY_GIT_SUBCOMMAND: Record<string, string> = { checkout: "-b", switch: "-c" };

/**
 * Paths introduced by name-creating commands:
 * mkdir, touch, git checkout -b, git switch -c, cp/mv destinations.
 * Agents name things in shell commands too, not only in the files they write.
 */
export function extractFromBash(command: string): Identifier[] {
  return command
    .split(COMMAND_SEPARATOR)
    .flatMap((part) => extractFromShellWords(splitShellWords(part)));
}

/** The identifiers one simple command introduces. Each program takes its names its own way. */
function extractFromShellWords([program, ...args]: string[]): Identifier[] {
  const operands = args.filter((arg) => !arg.startsWith("-"));
  switch (program) {
    case "mkdir":
      return operands.flatMap((path) => extractFromPath(path, { isDir: true }));
    case "touch":
      return operands.flatMap((path) => extractFromPath(path));
    case "cp":
    case "mv":
      return operands.length >= 2 ? extractFromPath(operands.at(-1)!) : [];
    case "git":
      return extractFromGitBranch(args);
    default:
      return [];
  }
}

/** The branch a `git checkout -b` or `git switch -c` creates. A branch name is a name too. */
function extractFromGitBranch([subcommand, ...args]: string[]): Identifier[] {
  const flagIndex = args.indexOf(BRANCH_FLAG_BY_GIT_SUBCOMMAND[subcommand]);
  const branch = flagIndex === -1 ? undefined : args[flagIndex + 1];
  if (!branch) return [];
  return [
    {
      name: branch,
      kind: "string",
      file: "<git-branch>",
      isNew: true,
      segments: branch.split(/[/\-_]+/),
    },
  ];
}

/**
 * Split a command line on whitespace, honouring single and double quotes. No expansion.
 * Enough to find the operands of the few commands that create names.
 */
function splitShellWords(command: string): string[] {
  const words = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return words.map((word) => word.replace(/^(["'])(.*)\1$/, "$2"));
}
