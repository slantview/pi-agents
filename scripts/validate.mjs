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

console.log(`validated ${agents.length} agents, ${skills.length} skills, JSON configuration, and redaction policy`);
