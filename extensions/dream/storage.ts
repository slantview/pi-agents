import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { DreamAnalysisRecord, DreamLedger, DreamProjectMapping } from "./types.ts";

const STATE_DIR = path.join("state", "dream");
const LEDGER_FILE = "ledger.json";
const LOCK_FILE = "ledger.lock";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const PROJECT = /^[a-z0-9][a-z0-9-]{0,99}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const SESSION_HASH = /^[a-f0-9]{12}$/u;

export function emptyDreamLedger(): DreamLedger {
  return { version: 1, projectMappings: {}, analyses: {} };
}

const safeMapping = (value: any): DreamProjectMapping | undefined => {
  if (!value || typeof value !== "object") return undefined;
  if (typeof value.project !== "string" || !PROJECT.test(value.project)) return undefined;
  if (typeof value.repository !== "string" || value.repository.length < 3 || value.repository.length > 240 || /[\r\n\0]/u.test(value.repository)) return undefined;
  if (typeof value.capturedAt !== "string" || !ISO_DATE.test(value.capturedAt)) return undefined;
  return { project: value.project, repository: value.repository, capturedAt: value.capturedAt };
};

const safeAnalysis = (value: any): DreamAnalysisRecord | undefined => {
  if (!value || typeof value !== "object") return undefined;
  if (typeof value.project !== "string" || !PROJECT.test(value.project)) return undefined;
  if (typeof value.analyzedAt !== "string" || !ISO_DATE.test(value.analyzedAt)) return undefined;
  if (typeof value.reportDigest !== "string" || !DIGEST.test(value.reportDigest)) return undefined;
  return { project: value.project, analyzedAt: value.analyzedAt, reportDigest: value.reportDigest };
};

function normalizeLedger(value: unknown, maxEntries = 500): DreamLedger {
  if (!value || typeof value !== "object" || (value as any).version !== 1) throw new Error("Dream ledger is malformed");
  const source = value as any;
  const ledger = emptyDreamLedger();
  if (source.lastReminderAt !== undefined) {
    if (typeof source.lastReminderAt !== "string" || !ISO_DATE.test(source.lastReminderAt)) throw new Error("Dream ledger reminder metadata is malformed");
    ledger.lastReminderAt = source.lastReminderAt;
  }

  const mappings = Object.entries(source.projectMappings ?? {})
    .filter(([key]) => SESSION_HASH.test(key))
    .map(([key, item]) => [key, safeMapping(item)] as const)
    .filter((entry): entry is readonly [string, DreamProjectMapping] => !!entry[1])
    .sort((a, b) => Date.parse(b[1].capturedAt) - Date.parse(a[1].capturedAt))
    .slice(0, maxEntries);
  ledger.projectMappings = Object.fromEntries(mappings);

  const analyses = Object.entries(source.analyses ?? {})
    .filter(([key]) => DIGEST.test(key))
    .map(([key, item]) => [key, safeAnalysis(item)] as const)
    .filter((entry): entry is readonly [string, DreamAnalysisRecord] => !!entry[1])
    .sort((a, b) => Date.parse(b[1].analyzedAt) - Date.parse(a[1].analyzedAt))
    .slice(0, maxEntries);
  ledger.analyses = Object.fromEntries(analyses);
  return ledger;
}

const assertSafeExistingPath = async (candidate: string, kind: "directory" | "file") => {
  try {
    const stat = await fs.promises.lstat(candidate);
    if (stat.isSymbolicLink()) throw new Error(`Dream ${kind} must not be a symlink`);
    if (kind === "directory" && !stat.isDirectory()) throw new Error("Dream state path is not a directory");
    if (kind === "file" && (!stat.isFile() || stat.nlink !== 1)) throw new Error("Dream ledger must be a regular unlinked file");
  } catch (error: any) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
};

const statePaths = (agentDir: string) => {
  const state = path.join(agentDir, "state");
  const directory = path.join(agentDir, STATE_DIR);
  return { state, directory, ledger: path.join(directory, LEDGER_FILE), lock: path.join(directory, LOCK_FILE) };
};

async function ensureStateDirectory(agentDir: string) {
  const paths = statePaths(agentDir);
  await assertSafeExistingPath(paths.state, "directory");
  await fs.promises.mkdir(paths.state, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(paths.state, 0o700);
  await assertSafeExistingPath(paths.directory, "directory");
  await fs.promises.mkdir(paths.directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(paths.directory, 0o700);
  await assertSafeExistingPath(paths.ledger, "file");
  return paths;
}

export async function readDreamLedger(agentDir: string): Promise<DreamLedger> {
  const paths = statePaths(agentDir);
  await assertSafeExistingPath(paths.state, "directory");
  await assertSafeExistingPath(paths.directory, "directory");
  await assertSafeExistingPath(paths.ledger, "file");
  try {
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const handle = await fs.promises.open(paths.ledger, flags);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1_048_576) throw new Error("Dream ledger is not a bounded regular file");
      const text = await handle.readFile("utf8");
      return normalizeLedger(JSON.parse(text));
    } finally {
      await handle.close();
    }
  } catch (error: any) {
    if (error?.code === "ENOENT") return emptyDreamLedger();
    if (error instanceof SyntaxError) throw new Error("Dream ledger is malformed");
    throw error;
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface OwnedLock {
  handle: fs.promises.FileHandle;
  token: string;
}

async function readLockOwner(lock: string): Promise<{ pid: number; token: string } | undefined> {
  try {
    const stat = await fs.promises.lstat(lock);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024) return undefined;
    const handle = await fs.promises.open(lock, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
      const parsed = JSON.parse(await handle.readFile("utf8"));
      if (!Number.isSafeInteger(parsed?.pid) || !/^[a-f0-9]{32}$/u.test(parsed?.token)) return undefined;
      return { pid: parsed.pid, token: parsed.token };
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

async function acquireLock(lock: string): Promise<OwnedLock> {
  const flags = fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW ?? 0);
  for (let attempt = 0; attempt < 40; attempt++) {
    const token = randomBytes(16).toString("hex");
    try {
      const handle = await fs.promises.open(lock, flags, 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }));
      await handle.sync();
      return { handle, token };
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      const owner = await readLockOwner(lock);
      if (!owner) throw new Error("Dream ledger lock is malformed or unsafe");
      // Fail closed rather than stealing a possibly live lock. A lock left by a
      // crashed process requires explicit operator recovery.
      await delay(25);
    }
  }
  throw new Error("Dream ledger is busy");
}

async function releaseLock(lock: string, owned: OwnedLock): Promise<void> {
  await owned.handle.close().catch(() => undefined);
  const current = await readLockOwner(lock);
  if (current?.pid === process.pid && current.token === owned.token) {
    await fs.promises.unlink(lock).catch(() => undefined);
  }
}

export async function updateDreamLedger(
  agentDir: string,
  mutate: (ledger: DreamLedger) => DreamLedger | void,
  options: { maxEntries?: number } = {},
): Promise<DreamLedger> {
  const paths = await ensureStateDirectory(agentDir);
  const ownedLock = await acquireLock(paths.lock);
  try {
    const current = await readDreamLedger(agentDir);
    const draft = structuredClone(current);
    const candidate = mutate(draft) ?? draft;
    const normalized = normalizeLedger(candidate, options.maxEntries ?? 500);
    const temporary = path.join(paths.directory, `.ledger-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
    const flags = fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const handle = await fs.promises.open(temporary, flags, 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(normalized, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.promises.chmod(temporary, 0o600);
    await assertSafeExistingPath(paths.ledger, "file");
    await fs.promises.rename(temporary, paths.ledger);
    await fs.promises.chmod(paths.ledger, 0o600);
    return normalized;
  } finally {
    await releaseLock(paths.lock, ownedLock);
  }
}
