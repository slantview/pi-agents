import fs from "node:fs";
import path from "node:path";

export function assertContainedImagePath(inputRoot, candidatePath) {
  if (!inputRoot) throw new Error("Local input-image editing is disabled; configure MCP_IMAGE_INPUT_DIR explicitly");
  if (typeof candidatePath !== "string" || !path.isAbsolute(candidatePath)) {
    throw new Error("Input image path must be absolute");
  }
  const realRoot = fs.realpathSync(inputRoot);
  const realCandidate = fs.realpathSync(candidatePath);
  const relative = path.relative(realRoot, realCandidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Input image path is outside the configured image input root");
  }
  if (!fs.statSync(realCandidate).isFile()) throw new Error("Input image path must reference a regular file");
  return realCandidate;
}
