#!/usr/bin/env node
// Runs `tsc --noEmit` against every workspace's tsconfig.json. Root
// package.json's "typecheck" script referenced this file before it existed —
// CI's quality job was aspirational until this landed.
const { execFileSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

const roots = ["apps", "packages", "services"];
const fs = require("fs");

let failed = false;

for (const root of roots) {
  const rootPath = path.join(__dirname, "..", root);
  if (!existsSync(rootPath)) continue;
  for (const dir of fs.readdirSync(rootPath)) {
    const tsconfigPath = path.join(rootPath, dir, "tsconfig.json");
    if (!existsSync(tsconfigPath)) continue;
    console.log(`\n[typecheck] ${root}/${dir}`);
    try {
      execFileSync("npx", ["tsc", "--noEmit", "-p", tsconfigPath], {
        stdio: "inherit",
        shell: true,
      });
    } catch {
      failed = true;
    }
  }
}

if (failed) {
  console.error("\n[typecheck] FAILED — one or more workspaces have type errors.");
  process.exit(1);
}
console.log("\n[typecheck] all workspaces clean.");
