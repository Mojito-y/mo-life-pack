#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ALLOWED_METHODS = new Set(["initialize", "initialized", "thread/start", "turn/start"]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

export function hardenClientMessage(message, workspace) {
  requireObject(message, "JSON-RPC message");
  if (!Object.hasOwn(message, "method")) {
    return message;
  }
  if (!ALLOWED_METHODS.has(message.method)) {
    throw new Error(`unsupported Codex app-server method: ${String(message.method)}`);
  }
  if (message.method === "initialize" || message.method === "initialized") {
    return message;
  }

  const params = { ...requireObject(message.params, `${message.method} params`) };
  delete params.permissions;
  delete params.approvalsReviewer;
  params.approvalPolicy = "never";
  params.cwd = workspace;
  params.runtimeWorkspaceRoots = [workspace];
  params.environments = [];

  if (message.method === "thread/start") {
    params.sandbox = "read-only";
    params.ephemeral = true;
  } else {
    params.sandboxPolicy = { type: "readOnly", networkAccess: false };
  }

  return { ...message, params };
}

function runSelfTest() {
  const workspace = "/tmp/investment-coach-workspace";
  const thread = hardenClientMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "thread/start",
    params: {
      approvalPolicy: "on-request",
      cwd: "/tmp/escape",
      sandbox: "danger-full-access",
      permissions: "admin"
    }
  }, workspace);
  assert.equal(thread.params.approvalPolicy, "never");
  assert.equal(thread.params.sandbox, "read-only");
  assert.equal(thread.params.cwd, workspace);
  assert.deepEqual(thread.params.runtimeWorkspaceRoots, [workspace]);
  assert.deepEqual(thread.params.environments, []);
  assert.equal(thread.params.ephemeral, true);
  assert.equal(Object.hasOwn(thread.params, "permissions"), false);

  const turn = hardenClientMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "turn/start",
    params: {
      threadId: "thread-1",
      input: [{ type: "text", text: "hello" }],
      sandboxPolicy: { type: "dangerFullAccess" }
    }
  }, workspace);
  assert.deepEqual(turn.params.sandboxPolicy, { type: "readOnly", networkAccess: false });
  assert.equal(turn.params.cwd, workspace);
  assert.throws(
    () => hardenClientMessage({ jsonrpc: "2.0", method: "command/exec", params: {} }, workspace),
    /unsupported Codex app-server method/
  );
  process.stdout.write("OK codex read-only proxy self-test passed\n");
}

if (process.argv[2] === "--self-test") {
  runSelfTest();
  process.exit(0);
}

const forwardedArgs = process.argv.slice(2);
if (forwardedArgs.length !== 3 || forwardedArgs[0] !== "app-server" || forwardedArgs[1] !== "--listen" || forwardedArgs[2] !== "stdio://") {
  throw new Error("this proxy only permits: codex app-server --listen stdio://");
}

const workspace = process.env.MO_LIFE_PACK_INVESTMENT_WORKSPACE;
if (!workspace || !path.isAbsolute(workspace)) {
  throw new Error("MO_LIFE_PACK_INVESTMENT_WORKSPACE must be an absolute path");
}

const realCodex = process.env.MO_LIFE_PACK_CODEX_BIN;
if (!realCodex || !path.isAbsolute(realCodex)) {
  throw new Error("MO_LIFE_PACK_CODEX_BIN must point to the real Codex executable");
}

const selfPath = realpathSync(fileURLToPath(import.meta.url));
const wrapperPath = realpathSync(path.join(path.dirname(selfPath), "codex"));
if (realpathSync(realCodex) === wrapperPath) {
  throw new Error("MO_LIFE_PACK_CODEX_BIN points back to the safety proxy");
}

const child = spawn(realCodex, forwardedArgs, {
  cwd: workspace,
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"]
});

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on("error", (error) => {
  process.stderr.write(`[codex-readonly-proxy] failed to start Codex: ${error.message}\n`);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let rejected = false;
try {
  for await (const line of input) {
    if (!line.trim()) {
      continue;
    }
    const parsed = JSON.parse(line);
    const hardened = hardenClientMessage(parsed, workspace);
    if (!child.stdin.write(`${JSON.stringify(hardened)}\n`)) {
      await new Promise((resolve) => child.stdin.once("drain", resolve));
    }
  }
} catch (error) {
  rejected = true;
  process.stderr.write(`[codex-readonly-proxy] rejected client input: ${error.message}\n`);
  child.kill("SIGTERM");
} finally {
  child.stdin.end();
}

const exitCode = await new Promise((resolve) => child.once("exit", (code, signal) => {
  if (signal) {
    resolve(1);
  } else {
    resolve(code ?? 1);
  }
}));
process.exitCode = rejected ? 1 : exitCode;
