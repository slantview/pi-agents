#!/usr/bin/env node

const hint = process.argv[2]?.trim().toLowerCase();
if (!hint) process.exit(2);

let input = "";
for await (const chunk of process.stdin) input += chunk;

let accounts;
try {
  accounts = JSON.parse(input);
} catch {
  process.exit(2);
}
if (!Array.isArray(accounts)) process.exit(2);

const matches = accounts.filter((account) =>
  account && typeof account === "object" &&
  Object.values(account).some((value) => typeof value === "string" && value.toLowerCase().includes(hint)),
);
if (matches.length !== 1) process.exit(1);

const identifier = matches[0].account_uuid ?? matches[0].id;
if (typeof identifier !== "string" || !/^[A-Za-z0-9-]+$/.test(identifier)) process.exit(1);
process.stdout.write(identifier);
