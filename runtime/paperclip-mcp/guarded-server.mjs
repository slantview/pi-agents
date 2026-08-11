import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PaperclipApiClient } from "./node_modules/@paperclipai/mcp-server/dist/client.js";
import { readConfigFromEnv } from "./node_modules/@paperclipai/mcp-server/dist/config.js";
import { createToolDefinitions } from "./node_modules/@paperclipai/mcp-server/dist/tools.js";

import { bindPaperclipCompany, PAPERCLIP_ALLOWED_TOOLS } from "./policy.mjs";

const config = readConfigFromEnv();
if (!config.companyId) throw new Error("Paperclip MCP requires a trusted company identifier");
const client = bindPaperclipCompany(new PaperclipApiClient(config), config.companyId);
const allTools = createToolDefinitions(client);
const allowed = new Set(PAPERCLIP_ALLOWED_TOOLS);
const tools = allTools.filter((tool) => allowed.has(tool.name));
if (tools.length !== allowed.size) throw new Error("Paperclip MCP allowlist does not match the pinned server tool surface");

const server = new McpServer({ name: "paperclip-guarded", version: "0.1.3" });
for (const tool of tools) server.tool(tool.name, tool.description, tool.schema.shape, tool.execute);
await server.connect(new StdioServerTransport());
