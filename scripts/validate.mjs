import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  if ([".git", "node_modules"].includes(entry.name)) return [];
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const files = walk(root);

for (const file of files.filter((name) => name.endsWith(".json"))) {
  JSON.parse(fs.readFileSync(file, "utf8"));
}

const agents = files.filter((name) => name.startsWith(path.join(root, "agents")) && name.endsWith(".md"));
if (agents.length !== 11) throw new Error(`expected 11 agents, found ${agents.length}`);
for (const file of agents) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.startsWith("---\n") || !/^name:\s*\S+/m.test(text) || !/^description:\s*\S+/m.test(text)) {
    throw new Error(`invalid agent frontmatter: ${path.relative(root, file)}`);
  }
  const tools = text.match(/^tools:\s*(.+)$/m)?.[1]?.split(",").map((value) => value.trim()) ?? [];
  if (!tools.includes("mcp")) throw new Error(`agent lacks MCP access: ${path.relative(root, file)}`);
  if (/\bkingpin\b/i.test(text)) throw new Error(`agent contains Kingpin-specific language: ${path.relative(root, file)}`);
}

const skills = files.filter((name) => name.endsWith(`${path.sep}SKILL.md`));
if (skills.length !== 9) throw new Error(`expected 9 bundled skills, found ${skills.length}`);
for (const file of skills) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.startsWith("---\n") || !/^name:\s*[a-z0-9-]+$/m.test(text) || !/^description:\s*.+$/m.test(text)) {
    throw new Error(`invalid skill frontmatter: ${path.relative(root, file)}`);
  }
}

const forbidden = [
  /\/Users\/[^/$ {]+\//,
  /\/home\/[^/$ {]+\//,
  /a3tai\.1password\.com/i,
  /https?:\/\/[^/\s]+\.ts\.net/i,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
  /gh[opusr]_[A-Za-z0-9_]{20,}/,
  /sk-(?:live|test|proj)-[A-Za-z0-9_-]{16,}/
];
for (const file of files.filter((name) => !name.endsWith("package-lock.json"))) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(text)) throw new Error(`forbidden sensitive or machine-specific content in ${path.relative(root, file)}`);
  }
}

const safePermissions = JSON.parse(fs.readFileSync(path.join(root, "config/permissions.safe.json"), "utf8"));
if (safePermissions.yoloMode !== false || safePermissions.permission?.bash?.["*"] !== "ask" || safePermissions.permission?.mcp?.["*"] !== "ask" || safePermissions.permission?.mcp?.mcp_status !== "ask") {
  throw new Error("safe profile must prompt for unknown shell, MCP, and action-only MCP operations");
}

const mcp = JSON.parse(fs.readFileSync(path.join(root, "config/mcp.example.json"), "utf8"));
for (const [name, server] of Object.entries(mcp.mcpServers)) {
  const inspect = (value, key = "") => {
    if (Array.isArray(value)) return value.forEach((entry) => inspect(entry, key));
    if (value && typeof value === "object") return Object.entries(value).forEach(([childKey, child]) => inspect(child, childKey));
    if (typeof value !== "string") return;
    if (!/(key|token|secret|password|authorization)/i.test(key)) return;
    if (["oauth", "bearer"].includes(value)) return;
    if (!(value.startsWith("!op read ") || value.startsWith("${") || value.startsWith("$env:") || value.startsWith("$"))) {
      throw new Error(`literal credential-like value in MCP server ${name}`);
    }
  };
  inspect(server);
}

for (const [name, server] of Object.entries(mcp.mcpServers)) {
  if (server.command === "npx") throw new Error(`${name} must not resolve npm packages at runtime`);
  const inspectResolvers = (value) => {
    if (typeof value === "string" && value.startsWith("!") && !value.startsWith("!!") && value !== "!hostname -s" && !/^!op read 'op:\/\/[^'\r\n]+'$/.test(value)) {
      throw new Error(`${name} contains an unsupported shell-backed command resolver`);
    }
    if (Array.isArray(value)) value.forEach(inspectResolvers);
    else if (value && typeof value === "object") Object.values(value).forEach(inspectResolvers);
  };
  inspectResolvers(server);
}

for (const [serverName, secretName] of [["figma", "FIGMA_API_KEY"], ["mcp-image", "GEMINI_API_KEY"]]) {
  if (secretName in (mcp.mcpServers[serverName]?.env ?? {})) {
    throw new Error(`${serverName} credential must be resolved inside its clean-stage launcher`);
  }
}
if (!("IMAGE_INPUT_DIR" in (mcp.mcpServers["mcp-image"]?.env ?? {}))) {
  throw new Error("Image MCP must expose the explicit input-root policy setting");
}

const paperclip = mcp.mcpServers.paperclip;
if (!paperclip || paperclip.env !== undefined) {
  throw new Error("Paperclip MCP trusted endpoint, company, and credential must remain outside mergeable MCP env");
}
if (paperclip.exposeResources !== false || paperclip.includeTools?.length !== 38 || paperclip.approveTools?.length !== 17 || paperclip.includeTools.some((name) => ["paperclipMe", "paperclipInboxLite", "paperclipApiRequest"].includes(name))) {
  throw new Error("Paperclip MCP company-bound tool surface must remain explicitly allowlisted and approval-gated");
}
const runtimeSpecs = [
  { server: "paperclip", runtime: "paperclip-mcp", packageName: "@paperclipai/mcp-server", version: "2026.722.0" },
  { server: "figma", runtime: "figma-mcp", packageName: "figma-developer-mcp", version: "0.13.2" },
  { server: "mcp-image", runtime: "mcp-image", packageName: "mcp-image", version: "0.12.1" },
];
for (const spec of runtimeSpecs) {
  const server = mcp.mcpServers[spec.server];
  const runtimeRoot = path.join(root, "runtime", spec.runtime);
  const runtimeManifest = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "package.json"), "utf8"));
  const runtimeLock = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "package-lock.json"), "utf8"));
  const launcher = fs.readFileSync(path.join(runtimeRoot, "launch.sh"), "utf8");
  if (server.command !== "/bin/sh" || !server.args?.[0]?.includes(`runtime/${spec.runtime}/launch.sh`) || server.args.length !== 1) {
    throw new Error(`${spec.server} must use its fixed lockfile-controlled launcher`);
  }
  if (runtimeManifest.dependencies?.[spec.packageName] !== spec.version || runtimeLock.packages?.[""]?.dependencies?.[spec.packageName] !== spec.version || !runtimeLock.packages?.[`node_modules/${spec.packageName}`]?.integrity?.startsWith("sha512-")) {
    throw new Error(`${spec.server} runtime must remain exact-pinned with lockfile integrity`);
  }
  if (/set -x|echo .*API_KEY/.test(launcher)) {
    throw new Error(`${spec.server} launcher must not trace or print credential values`);
  }
  const cleanStage = launcher.indexOf("/usr/bin/env -i");
  const secretRead = launcher.indexOf('"$op_bin" read');
  if (cleanStage === -1 || secretRead === -1 || cleanStage > secretRead || launcher.indexOf("/usr/bin/env -i", cleanStage + 1) !== -1) {
    throw new Error(`${spec.server} must enter its clean stage before resolving a credential and directly exec afterward`);
  }
}
const paperclipLauncher = fs.readFileSync(path.join(root, "runtime/paperclip-mcp/launch.sh"), "utf8");
for (const field of ["PAPERCLIP_PI_BOARD_TOKEN", "PAPERCLIP_API_URL", "PAPERCLIP_COMPANY_ID"]) {
  if (!paperclipLauncher.includes(field)) throw new Error(`Paperclip launcher must resolve trusted ${field}`);
}
const opResolver = fs.readFileSync(path.join(root, "runtime/op-read.sh"), "utf8");
for (const required of ["op-path", "home-path", "/usr/bin/env -i"]) {
  if (!opResolver.includes(required)) throw new Error(`Trusted 1Password resolver must include ${required}`);
}
if (runtimeSpecs.some(({ runtime }) => !fs.readFileSync(path.join(root, "runtime", runtime, "launch.sh"), "utf8").includes("/usr/bin/env -i"))) {
  throw new Error("Every credential-bearing MCP launcher must enter a minimal environment before resolving secrets");
}
for (const file of [
  "runtime/paperclip-mcp/guarded-server.mjs",
  "runtime/paperclip-mcp/policy.mjs",
  "runtime/mcp-image/guarded-server.mjs",
  "runtime/mcp-image/policy.mjs",
]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing guarded MCP runtime file: ${file}`);
}
const figmaRuntime = JSON.parse(fs.readFileSync(path.join(root, "runtime/figma-mcp/package.json"), "utf8"));
if (figmaRuntime.overrides?.["figma-developer-mcp"]?.["@modelcontextprotocol/sdk"] !== "1.30.0" || figmaRuntime.overrides?.["@hono/node-server"] !== "2.1.0") {
  throw new Error("Figma MCP security overrides must remain exact-pinned");
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (!manifest.pi?.extensions?.includes("./extensions/mcp-isolated/index.ts") || manifest.pi.extensions.includes("./node_modules/pi-mcp-adapter/index.ts")) {
  throw new Error("pi-mcp-adapter must use the project-isolated global snapshot wrapper");
}
const adapterHardening = [
  ["tool-result-renderer.ts", "PI_AGENTS_TERMINAL_HARDENING"],
  ["mcp-output-guard.ts", "PI_AGENTS_NO_MCP_ARTIFACT_RETENTION"],
  ["utils.ts", "PI_AGENTS_METADATA_TERMINAL_HARDENING"],
  ["commands.ts", "PI_AGENTS_MCP_METADATA_HARDENING"],
  ["ui-session.ts", "PI_AGENTS_MCP_UI_NOTIFICATION_HARDENING"],
];
for (const [file, marker] of adapterHardening) {
  const source = fs.readFileSync(path.join(root, "node_modules/pi-mcp-adapter", file), "utf8");
  if (!source.includes(marker)) throw new Error(`Missing reviewed pi-mcp-adapter hardening: ${file}`);
}
if (manifest.dependencies?.["@jmcombs/pi-notify"] || !manifest.pi?.extensions?.includes("./extensions/notify/index.ts")) {
  throw new Error("the hardened local notification fork must replace the upstream notification entry point");
}
for (const name of ["sessions", "handoff", "btw"]) {
  if (!manifest.pi?.extensions?.includes(`./extensions/${name}/index.ts`) || manifest.pi.extensions.some((entry) => entry.includes(`pi-agent-extensions/extensions/${name}/`))) {
    throw new Error(`${name} must use the repository-owned hardened fork`);
  }
}

console.log(`validated ${agents.length} agents, ${skills.length} skills, JSON configuration, and redaction policy`);
