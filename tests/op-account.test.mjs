import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const resolver = path.resolve(import.meta.dirname, "../scripts/resolve-op-account.mjs");
const accounts = JSON.stringify([
  { account_uuid: "first-id", url: "https://example.1password.com", email: "user@example.test" },
  { account_uuid: "target-id", url: "https://work.1password.com", email: "user@work.test" },
]);

test("account resolver returns the ID for one case-insensitive hint match", () => {
  const result = spawnSync(process.execPath, [resolver, "WORK"], { input: accounts, encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "target-id");
});

test("account resolver rejects ambiguous hints without exposing account metadata", () => {
  const result = spawnSync(process.execPath, [resolver, "user"], { input: accounts, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("account resolver rejects unsafe account identifiers", () => {
  const result = spawnSync(process.execPath, [resolver, "unsafe"], {
    input: '[{"account_uuid":"--option value","url":"https://unsafe.1password.com"}]',
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
});

test("account resolver rejects malformed account data", () => {
  const result = spawnSync(process.execPath, [resolver, "work"], { input: "not-json", encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
