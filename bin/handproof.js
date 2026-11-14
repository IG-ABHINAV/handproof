#!/usr/bin/env node
// The npm `bin` entry. handproof runs on Bun (it uses bun:sqlite), so this runs the built server
// with Bun whether npx (Node) or bunx (Bun) started it, and prints an install hint when there's no Bun.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const server = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const bun = process.versions.bun ? process.execPath : "bun";

const child = spawn(bun, [server, ...process.argv.slice(2)], {
  stdio: "inherit",
  // Its own process group, so a forwarded signal reaches the real server even
  // when `bun` on PATH is a shell wrapper (for example the shim a pnpm global
  // install creates): the wrapper is the direct child and the server runs as
  // its child in the same group, so killing the direct child alone would
  // leave the server running. Windows has no process groups, so there the
  // direct child is killed as before.
  detached: process.platform !== "win32",
});

const forwarded = ["SIGINT", "SIGTERM", "SIGHUP"];
for (const signal of forwarded) {
  process.on(signal, () => {
    if (child.pid !== undefined && process.platform !== "win32") {
      try {
        // A negative pid kills the child's whole process group.
        process.kill(-child.pid, signal);
        return;
      } catch {
        // The child (or its group) is already gone: fall through to the direct kill.
      }
    }
    child.kill(signal);
  });
}

child.on("error", (err) => {
  if (err.code === "ENOENT") {
    process.stderr.write("handproof needs Bun 1.4 or later: install it from https://bun.sh, then run this again\n");
  } else {
    process.stderr.write(`handproof: could not start Bun: ${err.message}\n`);
  }
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    // Die by the same signal, so whoever started us sees how the server ended.
    for (const s of forwarded) process.removeAllListeners(s);
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
