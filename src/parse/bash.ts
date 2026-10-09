import type { Identifier } from "../types.ts";

// ponytail: split on separators naively; a `;` inside quotes is rare in agent commands.
const COMMAND_SEPARATOR = /\s*(?:&&|\|\||;|\|)\s*/;
const BRANCH_FLAG_BY_GIT_SUBCOMMAND: Record<string, string> = { checkout: "-b", switch: "-c" };

/**
 * The branches a command creates with `git checkout -b` or `git switch -c`.
 * Files a command writes are found after it runs, by diffing the working tree;
 * a branch name leaves no file behind, so it is read from the command itself.
 */
export function extractFromBash(command: string): Identifier[] {
  return command
    .split(COMMAND_SEPARATOR)
    .flatMap((part) => extractFromGitBranch(splitShellWords(part)));
}

/** The branch one simple command creates, if it is a `git checkout -b` or `git switch -c`. */
function extractFromGitBranch(words: string[]): Identifier[] {
  const [program, subcommand] = words;
  const args = words.slice(2);
  if (program !== "git") return [];
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

/** Split a command line on whitespace, honouring single and double quotes. No expansion. */
function splitShellWords(command: string): string[] {
  const words = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return words.map((word) => word.replace(/^(["'])(.*)\1$/, "$2"));
}
