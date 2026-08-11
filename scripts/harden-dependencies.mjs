import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(import.meta.dirname, "..");

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function replaceExact(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first === -1 || text.indexOf(oldText, first + oldText.length) !== -1) {
    throw new Error(`Unable to apply exact dependency hardening replacement: ${label}`);
  }
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

function patchFile(relativePath, originalHash, marker, mutate) {
  const filePath = path.join(root, relativePath);
  let text = fs.readFileSync(filePath, "utf8");
  if (text.includes(marker)) return;
  const actualHash = sha256(text);
  if (actualHash !== originalHash) {
    throw new Error(`${relativePath} does not match the reviewed pi-mcp-adapter@2.21.2 source`);
  }
  text = mutate(text);
  if (!text.includes(marker)) throw new Error(`Dependency hardening marker missing after patch: ${relativePath}`);
  fs.writeFileSync(filePath, text);
}

patchFile(
  "node_modules/pi-mcp-adapter/tool-result-renderer.ts",
  "5b0d14e9d74c7065ee3d36e3c32a2cb4077ca8ccd83915933c9630eebf41fcc7",
  "PI_AGENTS_TERMINAL_HARDENING",
  (source) => {
    let text = replaceExact(
      source,
      "const COLLAPSED_RENDER_CHAR_SLACK = 8;",
      `const COLLAPSED_RENDER_CHAR_SLACK = 8;\n\n// PI_AGENTS_TERMINAL_HARDENING: MCP payloads are untrusted terminal text.\nconst UNSAFE_MCP_TERMINAL_CONTROLS = /[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u206f]/gu;\nfunction sanitizeMcpTerminalText(value: string): string {\n  return value.replace(/\\r\\n?/gu, "\\n").replace(/\\t/gu, " ").replace(UNSAFE_MCP_TERMINAL_CONTROLS, "");\n}`,
      "terminal sanitizer",
    );
    text = replaceExact(
      text,
      "  const [title = \"mcp\", ...rest] = lines;",
      "  const [title = \"mcp\", ...rest] = lines.map(sanitizeMcpTerminalText);",
      "tool-call lines",
    );
    text = replaceExact(
      text,
      "    return block.text.split(\"\\n\");",
      "    return sanitizeMcpTerminalText(block.text).split(\"\\n\");",
      "expanded text result",
    );
    text = replaceExact(
      text,
      "  return [`[image: ${block.mimeType}]`];",
      "  return [sanitizeMcpTerminalText(`[image: ${block.mimeType}]`)];",
      "expanded image result",
    );
    text = replaceExact(
      text,
      "  const appendLine = (line: string) => {\n    if (lines.length >= maxLines || remainingChars <= 0) {",
      "  const appendLine = (line: string) => {\n    line = sanitizeMcpTerminalText(line);\n    if (lines.length >= maxLines || remainingChars <= 0) {",
      "collapsed result",
    );
    return replaceExact(
      text,
      "  const identity = formatMcpToolResultIdentity(result.details);",
      "  const rawIdentity = formatMcpToolResultIdentity(result.details);\n  const identity = rawIdentity ? sanitizeMcpTerminalText(rawIdentity) : null;",
      "result identity",
    );
  },
);

patchFile(
  "node_modules/pi-mcp-adapter/utils.ts",
  "478dbb00dffa8701e9cee3e67e62b7878bb8036b72a753e1bb9962fc519efd7e",
  "PI_AGENTS_METADATA_TERMINAL_HARDENING",
  (source) => replaceExact(
    source,
    `.replace(/[\\u0000-\\u001f\\u007f-\\u009f]+/g, " ")`,
    `.replace(/[\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u206f]+/g, " ") // PI_AGENTS_METADATA_TERMINAL_HARDENING`,
    "shared metadata sanitizer",
  ),
);

patchFile(
  "node_modules/pi-mcp-adapter/commands.ts",
  "c041fc7e13e3f8f649a1a521e51573547b512b8b12c2e3169287fc576f8bdd07",
  "PI_AGENTS_MCP_METADATA_HARDENING",
  (source) => {
    let text = replaceExact(
      source,
      `  for (const [serverName, prompts] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {\n    lines.push(\`${"${serverName}"}:\`);\n    for (const prompt of prompts.sort((a, b) => a.commandName.localeCompare(b.commandName))) {\n      const args = prompt.arguments.map(argument => argument.required ? \`<${"${argument.name}"}>\` : \`[${"${argument.name}"}]\`).join(" ");\n      lines.push(\`  /${"${prompt.commandName}"}${"${args ? ` ${args}` : \"\"}"}\`);\n      if (prompt.description) lines.push(\`      ${"${prompt.description}"}\`);\n    }`,
      `  for (const [serverName, prompts] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {\n    lines.push(\`${"${sanitizeTerminalText(serverName)}"}:\`); // PI_AGENTS_MCP_METADATA_HARDENING\n    for (const prompt of prompts.sort((a, b) => a.commandName.localeCompare(b.commandName))) {\n      const args = prompt.arguments.map(argument => argument.required ? \`<${"${sanitizeTerminalText(argument.name)}"}>\` : \`[${"${sanitizeTerminalText(argument.name)}"}]\`).join(" ");\n      const commandName = sanitizeTerminalText(prompt.commandName);\n      lines.push(\`  /${"${commandName}"}${"${args ? ` ${args}` : \"\"}"}\`);\n      if (prompt.description) lines.push(\`      ${"${sanitizeTerminalText(prompt.description)}"}\`);\n    }`,
      "prompt metadata",
    );
    return replaceExact(
      text,
      `    ...allTools.map(t => \`  ${"${t}"}\`),`,
      `    ...allTools.map(t => \`  ${"${sanitizeTerminalText(t)}"}\`),`,
      "tool metadata",
    );
  },
);

patchFile(
  "node_modules/pi-mcp-adapter/ui-session.ts",
  "8b848a37d445238f5aa94d474b4869b4a77438cf0d7b7cd05189e96e94623906",
  "PI_AGENTS_MCP_UI_NOTIFICATION_HARDENING",
  (source) => {
    let text = replaceExact(
      source,
      `import { throwIfAborted } from "./abort.ts";`,
      `import { throwIfAborted } from "./abort.ts";\nimport { sanitizeTerminalText } from "./utils.ts";`,
      "MCP UI sanitizer import",
    );
    text = replaceExact(
      text,
      `          const intent = params.intent ?? "";\n          const intentParams = params.params;\n          if (intent && state.sendMessage) {\n            const paramsStr = intentParams ? \` ${"${JSON.stringify(intentParams)}"}\` : "";\n            state.sendMessage(\n              {\n                customType: "mcp-ui-intent",\n                content: [{ type: "text", text: \`User triggered intent from ${"${request.serverName}"} UI: ${"${intent}"}${"${paramsStr}"}\` }],\n                display: \`🎯 UI Intent: ${"${intent}"}\`,`,
      `          const intent = params.intent ?? "";\n          const intentParams = params.params;\n          if (intent && state.sendMessage) {\n            const safeIntent = sanitizeTerminalText(intent);\n            const safeServerName = sanitizeTerminalText(request.serverName);\n            const paramsStr = intentParams ? \` ${"${sanitizeTerminalText(JSON.stringify(intentParams))}"}\` : "";\n            state.sendMessage(\n              {\n                customType: "mcp-ui-intent",\n                content: [{ type: "text", text: \`User triggered intent from ${"${safeServerName}"} UI: ${"${safeIntent}"}${"${paramsStr}"}\` }],\n                display: \`🎯 UI Intent: ${"${safeIntent}"}\`,`,
      "MCP UI intent display",
    );
    return replaceExact(
      text,
      `            state.ui.notify(\`[${"${request.serverName}"}] ${"${text}"}\`, "info");`,
      `            state.ui.notify(\`[${"${sanitizeTerminalText(request.serverName)}"}] ${"${sanitizeTerminalText(text)}"}\`, "info"); // PI_AGENTS_MCP_UI_NOTIFICATION_HARDENING`,
      "MCP UI notification",
    );
  },
);

patchFile(
  "node_modules/pi-mcp-adapter/mcp-output-guard.ts",
  "8bc7d7abfc8d448b9a4fb54738adc51ed4d6775f032e39b90d04d1404c4a980b",
  "PI_AGENTS_NO_MCP_ARTIFACT_RETENTION",
  (source) => {
    let text = replaceExact(
      source,
      `import { randomBytes } from "node:crypto";\nimport { mkdtemp, writeFile } from "node:fs/promises";\nimport { tmpdir } from "node:os";\nimport { join } from "node:path";\n`,
      "",
      "artifact imports",
    );
    return replaceExact(
      text,
      `async function saveArtifact(kind: string, text: string): Promise<{ path?: string; error?: string }> {\n  try {\n    const dir = await mkdtemp(join(tmpdir(), "pi-mcp-output-"));\n    const path = join(dir, \`${"${kind}"}-${"${randomBytes(4).toString(\"hex\")}"}.txt\`);\n    await writeFile(path, text, { encoding: "utf8", mode: 0o600 });\n    return { path };\n  } catch (error) {\n    return { error: error instanceof Error ? error.message : String(error) };\n  }\n}`,
      `async function saveArtifact(_kind: string, _text: string): Promise<{ path?: string; error?: string }> {\n  // PI_AGENTS_NO_MCP_ARTIFACT_RETENTION: keep bounded previews in memory only.\n  return { error: "Full MCP output persistence is disabled by the pi-agents security profile" };\n}`,
      "artifact persistence",
    );
  },
);
