import assert from "node:assert/strict";
import test from "node:test";

import { PAPERCLIP_ALLOWED_TOOLS, bindPaperclipCompany } from "../runtime/paperclip-mcp/policy.mjs";

const trustedCompany = "11111111-1111-1111-1111-111111111111";
const otherCompany = "22222222-2222-2222-2222-222222222222";

test("Paperclip wrapper pins company arguments and object resources", async () => {
  const calls = [];
  const client = {
    resolveCompanyId(value) { return value || trustedCompany; },
    async requestJson(method, requestPath, options) {
      calls.push([method, requestPath, options]);
      if (requestPath === "/issues/good") return { id: "good", companyId: trustedCompany };
      if (requestPath === "/issues/foreign") return { id: "foreign", companyId: otherCompany };
      return { ok: true };
    },
  };
  bindPaperclipCompany(client, trustedCompany);

  assert.equal(client.resolveCompanyId(), trustedCompany);
  assert.equal(client.resolveCompanyId(trustedCompany), trustedCompany);
  assert.throws(() => client.resolveCompanyId(otherCompany), /configured company/i);
  await assert.rejects(() => client.requestJson("GET", "/companies/22222222-2222-2222-2222-222222222222/issues"), /configured company/i);
  await assert.rejects(() => client.requestJson("GET", "/issues/foreign"), /configured company/i);
  await assert.rejects(
    () => client.requestJson("POST", `/companies/${trustedCompany}/approvals`, { body: { issueIds: ["foreign"] } }),
    /configured company/i,
  );
  await client.requestJson("POST", "/issues/good/comments", { body: { body: "ok" } });
  assert.deepEqual(calls.slice(-2).map((entry) => entry.slice(0, 2)), [
    ["GET", "/issues/good"],
    ["POST", "/issues/good/comments"],
  ]);
  await client.requestJson("GET", "/projects/project-1");
  assert.match(calls.at(-1)[1], /companyId=11111111-1111-1111-1111-111111111111/);
});

test("Paperclip server-side allowlist omits actor-wide and generic escape tools", () => {
  assert.equal(PAPERCLIP_ALLOWED_TOOLS.length, 38);
  assert.ok(!PAPERCLIP_ALLOWED_TOOLS.includes("paperclipMe"));
  assert.ok(!PAPERCLIP_ALLOWED_TOOLS.includes("paperclipInboxLite"));
  assert.ok(!PAPERCLIP_ALLOWED_TOOLS.includes("paperclipApiRequest"));
});
