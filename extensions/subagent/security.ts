import fs from "node:fs";
import path from "node:path";

export function assertProjectAgentAccess(includesProjectAgents: boolean, trusted: boolean, hasUI: boolean): void {
  if (!includesProjectAgents) return;
  if (!trusted) throw new Error("Project-local agents require an explicit Pi project-trust decision");
  if (!hasUI) throw new Error("Project-local agents require interactive user approval");
}

/** Resolve a child working directory while preserving the parent's repository boundary. */
export function resolveContainedCwd(baseCwd: string, requestedCwd?: string): string {
  let base: string;
  let candidate: string;
  try {
    base = fs.realpathSync(baseCwd);
    candidate = fs.realpathSync(path.resolve(base, requestedCwd ?? "."));
  } catch {
    throw new Error("Subagent working directory must exist inside the parent working directory");
  }

  const relative = path.relative(base, candidate);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return candidate;
  }
  throw new Error("Subagent working directory must remain inside the parent working directory");
}
