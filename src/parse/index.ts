import { existsSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { Extractor, Identifier } from "../types.ts";
import { extractFromBash } from "./bash.ts";
import { relativize } from "./path.ts";

/**
 * One file before and after a change. `before` is null when the file did not exist;
 * `isFileNew` says whether its name is new, which a rename makes true while keeping the content.
 */
export type Change = { path: string; before: string | null; after: string; isFileNew: boolean };
type Edit = { old_string: string; new_string: string; replace_all?: boolean };
/**
 * The fields of a Write, Edit, MultiEdit or Bash call that matter here;
 * everything else in the tool input is ignored.
 */
type ToolInput = {
  file_path?: string;
  content?: string;
  edits?: Edit[];
  command?: string;
} & Partial<Edit>;

/**
 * Tool call in, identifiers out.
 * `isNew` means absent before this call, so names the agent did not touch are left alone.
 */
export function parseToolCall(
  toolName: string,
  input: unknown,
  extractors: Extractor[],
): Identifier[] {
  const toolInput = (input ?? {}) as ToolInput;
  if (toolName === "Bash") return extractFromBash(String(toolInput.command ?? ""));
  const change = reconstructChange(toolName, toolInput);
  return change ? extractFromChange(change, extractors) : [];
}

/**
 * The identifiers of the file after the change, `isNew` when the change introduced them.
 * Shared by the tool calls that say what they write and the working-tree diffs that do not.
 */
export function extractFromChange(change: Change, extractors: Extractor[]): Identifier[] {
  const extract = (content: string | null) => extractAll(extractors, change.path, content);
  const previousKeys = new Set(extract(change.before).map(toIdentifierKey));
  return extract(change.after).map((id) => ({
    ...id,
    isNew: isIntroduced(id, change, previousKeys),
  }));
}

/**
 * Reconstruct the file a Write/Edit/MultiEdit call would produce, and the file before it.
 * `null` for tools that don't touch a file, and for files outside the project:
 * scratch files and other repos are not the project's names to judge.
 */
function reconstructChange(toolName: string, input: ToolInput): Change | null {
  const absolutePath = input.file_path;
  if (!absolutePath) return null;
  const path = relativize(absolutePath);
  if (isAbsolute(path)) return null;
  const before = existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : null;
  const isFileNew = before === null;
  switch (toolName) {
    case "Write":
      return { path, before, after: String(input.content ?? ""), isFileNew };
    case "Edit":
      return { path, before, after: applyEdit(before ?? "", input as Edit), isFileNew };
    case "MultiEdit": {
      const after = (input.edits ?? []).reduce(applyEdit, before ?? "");
      return { path, before, after, isFileNew };
    }
    default:
      return null;
  }
}

/**
 * Whether the change introduces the identifier:
 * a file when its name is new,
 * a directory when it does not exist on disk (the path extractor already knows),
 * anything else when its kind and name are not in the previous content.
 */
function isIntroduced(id: Identifier, change: Change, previousKeys: Set<string>): boolean {
  if (id.kind === "file") return change.isFileNew;
  if (id.kind === "dir") return id.isNew;
  return !previousKeys.has(toIdentifierKey(id));
}

/** Every identifier the matching extractors find in the content. No content, no identifiers. */
function extractAll(extractors: Extractor[], path: string, content: string | null) {
  if (content === null) return [];
  return extractors
    .filter((extractor) => extractor.test(path))
    .flatMap((extractor) => extractor.extract(path, content));
}

/** Apply one edit the way Claude Code does: the first match, or every match with `replace_all`. */
function applyEdit(content: string, edit: Edit) {
  return edit.replace_all
    ? content.split(edit.old_string).join(edit.new_string)
    : content.replace(edit.old_string, () => edit.new_string);
}

/** Kind and name: what makes an identifier the same one before and after an edit. */
const toIdentifierKey = (id: Identifier) => `${id.kind}:${id.name}`;
