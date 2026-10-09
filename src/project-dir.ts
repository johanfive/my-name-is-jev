/**
 * The project the agent works in: the directory Claude Code names, else the working directory.
 * One definition, so the cache, the config and path parsing always agree on it.
 */
export const resolveProjectDir = () => process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
