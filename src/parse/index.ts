import { existsSync, readFileSync } from "node:fs";
import type { Extractor, Identifier } from "../types.ts";
import { fromBash } from "./bash.ts";
import { relativize } from "./path.ts";

type Change = { path: string; before: string | null; after: string };
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

const applyEdit = (content: string, e: Edit) =>
  e.replace_all
    ? content.split(e.old_string).join(e.new_string)
    : content.replace(e.old_string, () => e.new_string);

/**
 * Reconstruct the file a Write/Edit/MultiEdit call would produce.
 * `null` for tools that don't touch a file.
 */
function changeFor(toolName: string, input: ToolInput): Change | null {
  const abs = input.file_path;
  if (!abs) return null;
  const path = relativize(abs);
  const before = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  switch (toolName) {
    case "Write":
      return { path, before, after: String(input.content ?? "") };
    case "Edit":
      return { path, before, after: applyEdit(before ?? "", input as Edit) };
    case "MultiEdit":
      return { path, before, after: (input.edits ?? []).reduce(applyEdit, before ?? "") };
    default:
      return null;
  }
}

const keyOf = (id: Identifier) => `${id.kind}:${id.name}`;

/**
 * Tool call in, identifiers out.
 * `isNew` means absent before this call:
 * a file is new when it did not exist,
 * a directory when it does not exist on disk,
 * anything else when `kind:name` is not in the previous content.
 */
export function parse(toolName: string, input: unknown, extractors: Extractor[]): Identifier[] {
  const tool = (input ?? {}) as ToolInput;
  if (toolName === "Bash") return fromBash(String(tool.command ?? ""));
  const change = changeFor(toolName, tool);
  if (!change) return [];

  const run = (content: string | null) =>
    content === null
      ? []
      : extractors
          .filter((x) => x.test(change.path))
          .flatMap((x) => x.extract(change.path, content));

  const previous = new Set(run(change.before).map(keyOf));
  return run(change.after).map((id) => ({
    ...id,
    isNew:
      id.kind === "file"
        ? change.before === null
        : id.kind === "dir"
          ? id.isNew
          : !previous.has(keyOf(id)),
  }));
}
