import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(import.meta.dirname, "..");
const serverPath = path.join(root, "runtime/paperclip-mcp/guarded-server.mjs");

test("lockfile-controlled company-bound Paperclip MCP runtime starts without npx", async () => {
  const client = new Client({ name: "pi-agents-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      ...process.env,
      PAPERCLIP_API_URL: "http://127.0.0.1:9",
      PAPERCLIP_API_KEY: "test-placeholder-not-a-credential",
      PAPERCLIP_COMPANY_ID: "00000000-0000-0000-0000-000000000000",
    },
    stderr: "pipe",
  });

  try {
    await client.connect(transport);
    const result = await client.listTools();
    assert.equal(result.tools.length, 38);
    assert.ok(result.tools.some((tool) => tool.name === "paperclipListProjects"));
    assert.ok(!result.tools.some((tool) => ["paperclipMe", "paperclipInboxLite", "paperclipApiRequest"].includes(tool.name)));
  } finally {
    await client.close();
  }
});
