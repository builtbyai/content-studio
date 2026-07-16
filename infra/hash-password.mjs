#!/usr/bin/env node
// Hash a password using the same SHA-256(password||salt) scheme as the Worker's
// auth.ts. Prints values you paste into infra/seed-admin.sql or copy from
// the reference auth service's existing user row.
//
// Usage:
//   node infra/hash-password.mjs '<password>'
//   node infra/hash-password.mjs '<password>' '<existing salt>'   # if reusing the reference auth service row

import crypto from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node infra/hash-password.mjs <password> [salt]");
  process.exit(1);
}
const salt = process.argv[3] ?? crypto.randomBytes(16).toString("hex");
const hash = crypto.createHash("sha256").update(password + salt).digest("hex");

console.log(JSON.stringify({ salt, hash }, null, 2));
console.log("\nSQL fragment:");
console.log(`UPDATE users SET salt='${salt}', password_hash='${hash}' WHERE email='admin@example.com';`);
