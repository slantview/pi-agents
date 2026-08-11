import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { McpConfig, McpSettings, ServerEntry } from "pi-mcp-adapter/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function rewriteCommandResolver(value: unknown, resolverPath: string): unknown {
  if (typeof value !== "string" || !value.startsWith("!") || value.startsWith("!!")) return value;
  if (value === "!hostname -s") return os.hostname().split(".", 1)[0] || "unknown-host";
  const opRead = value.match(/^!op read '([^'\r\n]+)'$/);
  if (opRead?.[1]?.startsWith("op://")) {
    return `!/bin/sh ${shellQuote(resolverPath)} ${shellQuote(opRead[1])}`;
  }
  throw new Error("Unsupported MCP command resolver in isolated global configuration");
}

function rewriteServerResolvers(server: unknown, resolverPath: string): unknown {
  if (!isRecord(server)) return server;
  const rewritten = structuredClone(server);
  for (const recordName of ["env", "headers"]) {
    const record = rewritten[recordName];
    if (!isRecord(record)) continue;
    for (const [key, value] of Object.entries(record)) {
      record[key] = rewriteCommandResolver(value, resolverPath);
    }
  }
  if ("bearerToken" in rewritten) {
    rewritten.bearerToken = rewriteCommandResolver(rewritten.bearerToken, resolverPath);
  }
  if (isRecord(rewritten.oauth) && "clientSecret" in rewritten.oauth) {
    rewritten.oauth.clientSecret = rewriteCommandResolver(rewritten.oauth.clientSecret, resolverPath);
  }
  return rewritten;
}

/**
 * Load only the user-global MCP snapshot. Project files, imports, Agent Plugins,
 * and project-relative OAuth imports are deliberately outside this trust boundary.
 */
export function loadIsolatedMcpConfig(agentDir: string): McpConfig {
  const configPath = path.join(agentDir, "mcp.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Isolated global MCP configuration is missing: ${configPath}`);
  }

  const parsed: unknown = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) {
    throw new Error(`Invalid isolated global MCP configuration: ${configPath}`);
  }

  const rawSettings = isRecord(parsed.settings) ? parsed.settings : {};
  const { agentPluginPaths: _agentPluginPaths, oauthDir: _oauthDir, ...safeSettings } = rawSettings;
  const resolverPath = path.join(agentDir, "runtime", "op-read.sh");
  const mcpServers = Object.fromEntries(
    Object.entries(parsed.mcpServers).map(([name, server]) => [name, rewriteServerResolvers(server, resolverPath)]),
  ) as Record<string, ServerEntry>;
  const trustedLaunchers: Record<string, string> = {
    figma: "figma-mcp",
    "mcp-image": "mcp-image",
    paperclip: "paperclip-mcp",
  };
  for (const [serverName, runtimeName] of Object.entries(trustedLaunchers)) {
    const server = mcpServers[serverName];
    if (!server) continue;
    server.command = "/bin/sh";
    server.args = [path.join(agentDir, "runtime", runtimeName, "launch.sh")];
    delete server.cwd;
    delete server.url;
    delete server.headers;
    delete server.bearerToken;
    delete server.bearerTokenEnv;
    delete server.oauth;
    delete server.type;
  }
  return {
    mcpServers,
    settings: {
      ...(safeSettings as McpSettings),
      hostConfigDiscovery: "off",
    },
  };
}
