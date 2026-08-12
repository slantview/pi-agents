import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import dreamExtension from "./index.ts";
import { sessionIdentityHash } from "./session-reader.ts";
import { readDreamLedger } from "./storage.ts";

type Handler = (args: string | undefined, ctx: any) => Promise<void>;

const makePi = () => {
  const commands = new Map<string, Handler>();
  const events = new Map<string, Function[]>();
  const entries: Array<{ customType: string; data: unknown }> = [];
  return {
    commands,
    events,
    entries,
    pi: {
      registerCommand(name: string, definition: { handler: Handler }) {
        commands.set(name, definition.handler);
      },
      on(name: string, handler: Function) {
        const current = events.get(name) ?? [];
        current.push(handler);
        events.set(name, current);
      },
      appendEntry(customType: string, data: unknown) {
        entries.push({ customType, data });
      },
      async exec(_command: string, args: string[]) {
        if (args.includes("--show-toplevel")) return { code: 0, stdout: "/work/repo\n", stderr: "" };
        if (args.includes("remote.origin.url")) return { code: 0, stdout: "git@github.com:example/repo.git\n", stderr: "" };
        return { code: 1, stdout: "", stderr: "unexpected" };
      },
    },
  };
};

const writeOldSession = (agentDir: string, id: string, bodyLines: string[]) => {
  const file = path.join(agentDir, "sessions", "project", `${id}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const header = JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-08-10T10:00:00.000Z", cwd: "/work/repo" });
  fs.writeFileSync(file, `${[header, ...bodyLines].join("\n")}\n`, { mode: 0o600 });
  const old = new Date(Date.now() - 60 * 60_000);
  fs.utimesSync(file, old, old);
  return file;
};

const validBody = () => [
  JSON.stringify({ type: "message", id: "u1", parentId: null, timestamp: "2026-08-10T10:01:00.000Z", message: { role: "user", content: "We decided to require review.", timestamp: 1 } }),
  JSON.stringify({ type: "message", id: "a1", parentId: "u1", timestamp: "2026-08-10T10:02:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "The review gate was implemented." }], provider: "example", model: "source", timestamp: 2 } }),
];

const makeContext = (confirmResults: boolean[], complete: Function, editorResponse?: string) => {
  const notifications: string[] = [];
  let confirmIndex = 0;
  let editorCalls = 0;
  const confirmMessages: string[] = [];
  const context = {
    hasUI: true,
    cwd: "/work/current",
    model: { provider: "example", id: "dream-model", baseUrl: "https://models.example.test/v1" },
    modelRegistry: {
      hasConfiguredAuth: () => true,
      getApiKeyAndHeaders: async (model: any) => ({ ok: true, baseUrl: model.baseUrl }),
      getProvider: () => ({
        stream: (model: any, request: any, options: any) => ({ result: () => complete(model, request, options) }),
      }),
    },
    sessionManager: { getSessionId: () => "current-session" },
    ui: {
      confirm: async (_title: string, message: string) => {
        confirmMessages.push(message);
        return confirmResults[confirmIndex++] ?? false;
      },
      notify: (message: string) => notifications.push(message),
      setStatus: () => {},
      editor: async () => {
        editorCalls++;
        return editorResponse;
      },
      setEditorText: () => {},
    },
  };
  return { context, notifications, confirmMessages, get editorCalls() { return editorCalls; } };
};

test("cancelling the local disclosure gate prevents session parsing and model calls", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dream-index-cancel-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = temp;
  try {
    writeOldSession(temp, "legacy-session", ["this is deliberately malformed after the header"]);
    const harness = makePi();
    dreamExtension(harness.pi as any);
    let modelCalls = 0;
    const ui = makeContext([false], async () => { modelCalls++; throw new Error("must not run"); });
    await harness.commands.get("dream")!(undefined, ui.context);
    assert.equal(modelCalls, 0);
    assert.equal(ui.editorCalls, 0);
    assert.equal(ui.notifications.some((item) => /malformed/i.test(item)), false);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("cancelling provider disclosure prevents model calls after bounded local extraction", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dream-index-provider-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = temp;
  try {
    writeOldSession(temp, "provider-session", validBody());
    const harness = makePi();
    dreamExtension(harness.pi as any);
    let modelCalls = 0;
    const ui = makeContext([true, false], async () => { modelCalls++; throw new Error("must not run"); });
    await harness.commands.get("dream")!(undefined, ui.context);
    assert.equal(modelCalls, 0);
    assert.equal(ui.editorCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("provider consent displays and uses the authentication-resolved endpoint", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dream-index-endpoint-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = temp;
  try {
    writeOldSession(temp, "endpoint-session", validBody());
    const harness = makePi();
    dreamExtension(harness.pi as any);
    let calledBaseUrl = "";
    let calledProvider = "";
    const ui = makeContext([true, true], async (model: any) => {
      calledBaseUrl = model.baseUrl;
      calledProvider = model.provider;
      return { stopReason: "stop", content: [{ type: "text", text: '{"insights":[]}' }] };
    });
    ui.context.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: true, baseUrl: "https://approved.example.test/v1" });
    let confirmations = 0;
    ui.context.ui.confirm = async (_title: string, message: string) => {
      ui.confirmMessages.push(message);
      confirmations++;
      if (confirmations === 2) {
        ui.context.model = { provider: "attacker", id: "changed", baseUrl: "https://changed.example.test/v1" };
      }
      return true;
    };
    await harness.commands.get("dream")!(undefined, ui.context);
    assert.equal(calledBaseUrl, "https://approved.example.test/v1");
    assert.equal(calledProvider, "example");
    assert.match(ui.confirmMessages[1] ?? "", /https:\/\/approved\.example\.test/);
    assert.doesNotMatch(ui.confirmMessages[1] ?? "", /models\.example\.test/);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("a prepared Dream report activates the runtime pre-approval write guard", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dream-index-guard-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = temp;
  try {
    writeOldSession(temp, "guard-session", validBody());
    const harness = makePi();
    dreamExtension(harness.pi as any);
    const evidenceHash = sessionIdentityHash("guard-session", "/work/repo");
    const ui = makeContext([true, true], async () => ({
      stopReason: "stop",
      content: [{ type: "text", text: JSON.stringify({ insights: [{
        type: "decision",
        title: "Require governed memory review",
        content: "Dream-derived memory changes require complete-report approval.",
        confidence: "high",
        tags: ["dreaming"],
        evidenceSessionHashes: [evidenceHash],
        verification: [],
      }] }) }],
    }), "reviewed report prompt");
    await harness.commands.get("dream")!(undefined, ui.context);
    assert.equal(ui.editorCalls, 1);
    assert.equal(harness.entries.some((entry) => (entry.data as any)?.status === "pending"), true);

    const toolCall = harness.events.get("tool_call")![0]!;
    const blocked = await toolCall({
      toolName: "mcp",
      toolCallId: "early-write",
      input: { tool: "zikra_zikra_save_memory", args: { project: "github-com-example-repo-1234567890" } },
    });
    assert.equal(blocked?.block, true);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("tool-calling distiller output is rejected and never records an analysis", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dream-index-toolcall-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = temp;
  try {
    writeOldSession(temp, "toolcall-session", validBody());
    const harness = makePi();
    dreamExtension(harness.pi as any);
    let modelCalls = 0;
    const ui = makeContext([true, true], async (_model: unknown, request: any) => {
      modelCalls++;
      assert.equal("tools" in request, false);
      return {
        stopReason: "toolUse",
        content: [{ type: "toolCall", id: "bad", name: "zikra_save_memory", arguments: {} }],
      };
    });
    await harness.commands.get("dream")!(undefined, ui.context);
    assert.equal(modelCalls, 2);
    assert.equal(ui.editorCalls, 0);
    assert.deepEqual((await readDreamLedger(temp)).analyses, {});
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
