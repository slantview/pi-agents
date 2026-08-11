import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(import.meta.dirname, "..");

test("lockfile-controlled image MCP starts through the containment wrapper", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-image-runtime-"));
  const client = new Client({ name: "pi-agents-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "runtime/mcp-image/guarded-server.mjs")],
    env: {
      ...process.env,
      GEMINI_API_KEY: "test-placeholder-not-a-credential",
      IMAGE_OUTPUT_DIR: temp,
      IMAGE_INPUT_DIR: "",
      IMAGE_QUALITY: "balanced",
    },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const result = await client.listTools();
    assert.deepEqual(result.tools.map((tool) => tool.name), ["generate_image"]);
  } finally {
    await client.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
