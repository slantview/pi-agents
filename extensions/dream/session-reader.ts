import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { redactSensitiveText } from "./redaction.ts";
import { DREAM_POLICY_VERSION, type DreamSessionHeader, type DreamSnapshotMessage, type DreamSnapshotResult } from "./types.ts";

interface HeaderScanOptions {
  maxFiles: number;
  maxHeaderBytes: number;
}

interface SnapshotOptions {
  maxFileBytes: number;
  maxLineBytes: number;
  maxEntries: number;
  maxMessages: number;
  maxCharsPerMessage: number;
  maxCharsPerSession: number;
}

const bigintStatIdentity = (stat: fs.BigIntStats) => ({
  size: Number(stat.size),
  dev: stat.dev.toString(),
  ino: stat.ino.toString(),
  mtimeNs: stat.mtimeNs.toString(),
  modifiedMs: Number(stat.mtimeNs / 1_000_000n),
});

const sameStat = (left: fs.BigIntStats, right: fs.BigIntStats): boolean =>
  left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs;

async function readFirstLine(file: string, maxBytes: number): Promise<{ line: string; bytesRead: number } | undefined> {
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  const handle = await fs.promises.open(file, fs.constants.O_RDONLY | noFollow);
  try {
    const byte = Buffer.allocUnsafe(1);
    const bytes: number[] = [];
    while (bytes.length < maxBytes) {
      const result = await handle.read(byte, 0, 1, null);
      if (result.bytesRead === 0) break;
      const value = byte[0]!;
      bytes.push(value);
      if (value === 0x0a) break;
    }
    if (bytes.length === maxBytes && bytes.at(-1) !== 0x0a) return undefined;
    return { line: Buffer.from(bytes).toString("utf8").replace(/\r?\n$/u, ""), bytesRead: bytes.length };
  } finally {
    await handle.close();
  }
}

const validHeader = (value: any): value is { type: "session"; id: string; timestamp: string; cwd: string } =>
  value?.type === "session" &&
  typeof value.id === "string" && value.id.length > 0 && value.id.length <= 128 && !/[\r\n]/u.test(value.id) &&
  typeof value.cwd === "string" && value.cwd.length > 0 && value.cwd.length <= 4096 && path.isAbsolute(value.cwd) && !/[\r\n\0]/u.test(value.cwd) &&
  typeof value.timestamp === "string" && Number.isFinite(Date.parse(value.timestamp));

export async function scanSessionHeaders(root: string, options: HeaderScanOptions): Promise<DreamSessionHeader[]> {
  let rootStat: fs.Stats;
  try {
    rootStat = await fs.promises.lstat(root);
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Dream session root must be a real directory");

  const files: string[] = [];
  const directories = [root];
  const maximumDirectories = Math.max(10, options.maxFiles * 2);
  let visitedDirectories = 0;
  while (directories.length > 0 && files.length < options.maxFiles && visitedDirectories < maximumDirectories) {
    const directory = directories.pop()!;
    visitedDirectories++;
    const dir = await fs.promises.opendir(directory);
    for await (const entry of dir) {
      if (entry.isSymbolicLink()) continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory() && directories.length + visitedDirectories < maximumDirectories) directories.push(candidate);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(candidate);
      if (files.length >= options.maxFiles) break;
    }
  }

  const headers: DreamSessionHeader[] = [];
  for (const file of files) {
    try {
      const stat = await fs.promises.lstat(file, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || stat.size <= 0n || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) continue;
      const first = await readFirstLine(file, options.maxHeaderBytes);
      if (!first) continue;
      const parsed = JSON.parse(first.line);
      if (!validHeader(parsed)) continue;
      const identity = bigintStatIdentity(stat);
      headers.push({
        path: file,
        id: parsed.id,
        cwd: parsed.cwd,
        createdAt: new Date(parsed.timestamp).toISOString(),
        ...identity,
        headerBytesRead: first.bytesRead,
      });
    } catch {
      // Malformed, replaced, linked, or unreadable sessions are ineligible.
    }
  }
  return headers.sort((a, b) => b.modifiedMs - a.modifiedMs);
}

export function sessionIdentityHash(sessionId: string, cwd: string): string {
  return createHash("sha256").update(`${sessionId}\0${cwd}`).digest("hex").slice(0, 12);
}

export function sessionSnapshotKey(session: DreamSessionHeader, project: string): string {
  return createHash("sha256")
    .update([DREAM_POLICY_VERSION, project, session.id, session.dev, session.ino, session.size, session.mtimeNs].join("\0"))
    .digest("hex");
}

const textFromContent = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } =>
      !!part && typeof part === "object" && (part as any).type === "text" && typeof (part as any).text === "string")
    .map((part) => part.text)
    .join("\n");
};

interface ParsedEntry {
  parentId: string | null;
  message?: DreamSnapshotMessage;
  provider?: string;
  redactions: number;
}

export async function readBoundedSessionSnapshot(
  file: string,
  expected: Pick<DreamSessionHeader, "id" | "cwd" | "dev" | "ino" | "size" | "mtimeNs">,
  options: SnapshotOptions,
): Promise<DreamSnapshotResult> {
  let before: fs.BigIntStats;
  try {
    before = await fs.promises.lstat(file, { bigint: true });
  } catch {
    return { status: "skipped", reason: "session is unavailable" };
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) return { status: "skipped", reason: "session is not a regular private file" };
  if (
    before.dev.toString() !== expected.dev ||
    before.ino.toString() !== expected.ino ||
    Number(before.size) !== expected.size ||
    before.mtimeNs.toString() !== expected.mtimeNs
  ) return { status: "skipped", reason: "session no longer matches the approved snapshot" };
  if (before.size > BigInt(options.maxFileBytes)) return { status: "skipped", reason: "session exceeds the file-size policy" };

  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(file, fs.constants.O_RDONLY | noFollow);
    const opened = await handle.stat({ bigint: true });
    if (!sameStat(before, opened)) {
      await handle.close();
      return { status: "skipped", reason: "session changed before it could be opened" };
    }
  } catch {
    if (typeof handle !== "undefined") await handle.close().catch(() => undefined);
    return { status: "skipped", reason: "session cannot be opened safely" };
  }

  const entries = new Map<string, ParsedEntry>();
  let leafId: string | undefined;
  let headerSeen = false;
  let pending = Buffer.alloc(0);
  let totalRead = 0;
  let failure: string | undefined;

  const processLine = (line: Buffer) => {
    if (failure || line.length === 0) return;
    if (line.length > options.maxLineBytes) {
      failure = "session contains an oversized entry";
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(line.toString("utf8").replace(/\r$/u, ""));
    } catch {
      failure = "session contains malformed JSON";
      return;
    }
    if (!headerSeen) {
      headerSeen = true;
      if (!validHeader(parsed) || parsed.id !== expected.id || parsed.cwd !== expected.cwd) {
        failure = "session header no longer matches the approved snapshot";
      }
      return;
    }
    if (typeof parsed?.id !== "string" || parsed.id.length === 0 || parsed.id.length > 128 || entries.has(parsed.id)) {
      failure = "session entry identity is invalid";
      return;
    }
    const parentId = parsed.parentId === null || typeof parsed.parentId === "string" ? parsed.parentId : undefined;
    if (parentId === undefined) {
      failure = "session parent identity is invalid";
      return;
    }
    if (entries.size >= options.maxEntries) {
      failure = "session exceeds the entry-count policy";
      return;
    }

    let entry: ParsedEntry = { parentId, redactions: 0 };
    if (parsed.type === "message" && (parsed.message?.role === "user" || parsed.message?.role === "assistant")) {
      const raw = textFromContent(parsed.message.content);
      if (raw.trim()) {
        const redacted = redactSensitiveText(raw);
        const bounded = redacted.text.slice(0, options.maxCharsPerMessage).trim();
        if (bounded) entry.message = { role: parsed.message.role, text: bounded };
        entry.redactions = redacted.redactions + (raw.length > options.maxCharsPerMessage ? 1 : 0);
      }
      if (parsed.message.role === "assistant" && typeof parsed.message.provider === "string") {
        entry.provider = parsed.message.provider.slice(0, 80);
      }
    }
    entries.set(parsed.id, entry);
    leafId = parsed.id;
  };

  try {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    while (!failure) {
      const result = await handle.read(buffer, 0, buffer.length, null);
      if (result.bytesRead === 0) break;
      totalRead += result.bytesRead;
      if (totalRead > options.maxFileBytes) {
        failure = "session changed beyond the file-size policy";
        break;
      }
      pending = Buffer.concat([pending, buffer.subarray(0, result.bytesRead)]);
      if (pending.length > options.maxLineBytes && pending.indexOf(0x0a) === -1) {
        failure = "session contains an oversized entry";
        break;
      }
      let newline: number;
      while ((newline = pending.indexOf(0x0a)) !== -1) {
        processLine(pending.subarray(0, newline));
        pending = pending.subarray(newline + 1);
        if (failure) break;
      }
    }
    if (!failure && pending.length > 0) processLine(pending);
    const during = await handle.stat({ bigint: true });
    if (!sameStat(before, during)) failure = "session changed during analysis";
  } catch {
    failure = "session could not be read safely";
  } finally {
    await handle.close();
  }

  try {
    const after = await fs.promises.lstat(file, { bigint: true });
    if (!sameStat(before, after)) failure = "session changed during analysis";
  } catch {
    failure = "session changed during analysis";
  }
  if (failure || !headerSeen || !leafId) return { status: "skipped", reason: failure ?? "session has no analyzable entries" };

  const newest: Array<{ message: DreamSnapshotMessage; redactions: number; provider?: string }> = [];
  const seen = new Set<string>();
  let current: string | null | undefined = leafId;
  while (current) {
    if (seen.has(current)) return { status: "skipped", reason: "session branch contains a cycle" };
    seen.add(current);
    const entry = entries.get(current);
    if (!entry) return { status: "skipped", reason: "session branch is incomplete" };
    if (entry.message) newest.push({ message: entry.message, redactions: entry.redactions, provider: entry.provider });
    current = entry.parentId;
  }

  const chosen: typeof newest = [];
  let chars = 0;
  for (const item of newest) {
    if (chosen.length >= options.maxMessages) break;
    const remaining = options.maxCharsPerSession - chars;
    if (remaining <= 0) break;
    const text = item.message.text.slice(0, remaining);
    if (!text) continue;
    chosen.push({ ...item, message: { ...item.message, text } });
    chars += text.length;
  }
  chosen.reverse();
  if (chosen.length === 0) return { status: "skipped", reason: "session has no eligible user or assistant text" };

  const messages = chosen.map((item) => item.message);
  const providers = [...new Set(chosen.map((item) => item.provider).filter((value): value is string => !!value))].sort();
  const normalized = JSON.stringify(messages);
  return {
    status: "ok",
    messages,
    providers,
    redactions: chosen.reduce((sum, item) => sum + item.redactions, 0),
    inputBytes: Buffer.byteLength(normalized),
    inputDigest: createHash("sha256").update(normalized).digest("hex"),
  };
}
