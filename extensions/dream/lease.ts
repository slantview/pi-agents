import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HASH = /^[a-f0-9]{12}$/u;
const TOKEN = /^[a-f0-9]{32}$/u;
const MAX_LEASES = 500;
const FRESH_LEASE_MS = 3 * 60_000;

export interface ActiveSessionLease {
  file: string;
  hash: string;
  token: string;
}

const leaseDirectory = (agentDir: string) => path.join(agentDir, "state", "dream", "active");

async function ensureRealDirectory(agentDir: string, leaf: "active" | "claims"): Promise<string> {
  let current = agentDir;
  for (const component of ["state", "dream", leaf]) {
    const next = path.join(current, component);
    try {
      const stat = await fs.promises.lstat(next);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Dream lease path must use real directories");
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
      await fs.promises.mkdir(next, { mode: 0o700 });
    }
    await fs.promises.chmod(next, 0o700);
    current = next;
  }
  return current;
}

const isProcessAlive = (pid: number): boolean => {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error?.code === "EPERM";
  }
};

export async function createActiveSessionLease(agentDir: string, hash: string): Promise<ActiveSessionLease> {
  if (!HASH.test(hash)) throw new Error("Dream lease requires a hashed session identity");
  await waitForNoLiveAnalysisClaim(agentDir, hash);
  const directory = await ensureRealDirectory(agentDir, "active");
  const token = randomBytes(16).toString("hex");
  const file = path.join(directory, `${hash}-${token}.lease`);
  const flags = fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW ?? 0);
  const handle = await fs.promises.open(file, flags, 0o600);
  try {
    await handle.writeFile(`${JSON.stringify({ version: 1, hash, token, pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.promises.chmod(file, 0o600);
  const lease = { file, hash, token };
  try {
    await waitForNoLiveAnalysisClaim(agentDir, hash);
    return lease;
  } catch (error) {
    await releaseActiveSessionLease(lease);
    throw error;
  }
}

async function readOwnedLease(file: string): Promise<{ hash: string; token: string; pid: number } | undefined> {
  try {
    const stat = await fs.promises.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024) return undefined;
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const handle = await fs.promises.open(file, flags);
    try {
      const parsed = JSON.parse(await handle.readFile("utf8"));
      if (parsed?.version !== 1 || !HASH.test(parsed.hash) || !TOKEN.test(parsed.token) || !Number.isSafeInteger(parsed.pid)) return undefined;
      return { hash: parsed.hash, token: parsed.token, pid: parsed.pid };
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

export async function refreshActiveSessionLease(lease: ActiveSessionLease): Promise<void> {
  const parsed = await readOwnedLease(lease.file);
  if (!parsed || parsed.hash !== lease.hash || parsed.token !== lease.token || parsed.pid !== process.pid) {
    throw new Error("Dream active-session lease ownership changed");
  }
  const now = new Date();
  await fs.promises.utimes(lease.file, now, now);
}

export async function releaseActiveSessionLease(lease: ActiveSessionLease): Promise<void> {
  const parsed = await readOwnedLease(lease.file);
  if (!parsed || parsed.hash !== lease.hash || parsed.token !== lease.token || parsed.pid !== process.pid) return;
  await fs.promises.unlink(lease.file).catch(() => undefined);
}

export interface SessionAnalysisClaim {
  file: string;
  hash: string;
  token: string;
}

const claimFile = (agentDir: string, hash: string) => path.join(agentDir, "state", "dream", "claims", `${hash}.claim`);

async function readAnalysisClaim(file: string): Promise<{ hash: string; token: string; pid: number } | undefined> {
  return readOwnedLease(file);
}

async function waitForNoLiveAnalysisClaim(agentDir: string, hash: string): Promise<void> {
  const file = claimFile(agentDir, hash);
  for (;;) {
    const parsed = await readAnalysisClaim(file);
    if (!parsed) {
      const exists = await fs.promises.lstat(file).then(() => true).catch((error: any) => {
        if (error?.code === "ENOENT") return false;
        throw error;
      });
      if (exists) throw new Error("Dream analysis claim is malformed or unsafe");
      return;
    }
    if (!isProcessAlive(parsed.pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function createSessionAnalysisClaim(agentDir: string, hash: string): Promise<SessionAnalysisClaim | undefined> {
  if (!HASH.test(hash)) throw new Error("Dream analysis claim requires a hashed session identity");
  if ((await listActiveSessionHashes(agentDir)).has(hash)) return undefined;
  const directory = await ensureRealDirectory(agentDir, "claims");
  const file = path.join(directory, `${hash}.claim`);
  const token = randomBytes(16).toString("hex");
  const flags = fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW ?? 0);
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(file, flags, 0o600);
  } catch (error: any) {
    if (error?.code === "EEXIST") return undefined;
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify({ version: 1, hash, token, pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.promises.chmod(file, 0o600);
  const claim = { file, hash, token };
  if ((await listActiveSessionHashes(agentDir)).has(hash)) {
    await releaseSessionAnalysisClaim(claim);
    return undefined;
  }
  return claim;
}

export async function releaseSessionAnalysisClaim(claim: SessionAnalysisClaim): Promise<void> {
  const parsed = await readAnalysisClaim(claim.file);
  if (!parsed || parsed.hash !== claim.hash || parsed.token !== claim.token || parsed.pid !== process.pid) return;
  await fs.promises.unlink(claim.file).catch(() => undefined);
}

export async function listActiveSessionHashes(agentDir: string): Promise<Set<string>> {
  const directory = leaseDirectory(agentDir);
  try {
    const stat = await fs.promises.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Dream lease path must be a real directory");
  } catch (error: any) {
    if (error?.code === "ENOENT") return new Set();
    throw error;
  }

  const hashes = new Set<string>();
  const entries = (await fs.promises.readdir(directory, { withFileTypes: true })).slice(0, MAX_LEASES);
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".lease")) continue;
    const file = path.join(directory, entry.name);
    const parsed = await readOwnedLease(file);
    if (!parsed || !entry.name.startsWith(`${parsed.hash}-${parsed.token}`)) continue;
    const stat = await fs.promises.lstat(file).catch(() => undefined);
    if (!stat) continue;
    if (Date.now() - stat.mtimeMs <= FRESH_LEASE_MS || isProcessAlive(parsed.pid)) hashes.add(parsed.hash);
  }
  return hashes;
}
