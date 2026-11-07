// Snapshot of her machine and repo state for a help report. Every probe runs at once against one
// shared deadline, so one hung `gh` call cannot stall the whole bundle. A failed probe prints its reason, never throws.

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { redact } from "./help-bundle-redact.mjs";

const REPO = "ngtongsheng/gq-projects-crm";
// All probes share one deadline so the whole snapshot stays under ~9 s even when GitHub is slow.
const TOTAL_BUDGET_MS = 8_000;
const MAX_LINE_CHARS = 300;
const isWindows = process.platform === "win32";
const deadline = Date.now() + TOTAL_BUDGET_MS;

function run(command, args) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { encoding: "utf8", timeout: Math.max(500, deadline - Date.now()), maxBuffer: 20 * 1024 * 1024, windowsHide: true, shell: isWindows },
      (error, stdout, stderr) => {
        if (error) {
          const reason = error.killed ? "timed out" : (stderr || error.message).trim().split("\n")[0];
          resolve({ ok: false, text: reason });
        } else {
          resolve({ ok: true, text: stdout.trim() });
        }
      },
    );
  });
}

function lines(text, count, from = "start") {
  const all = text ? text.split("\n") : [];
  return from === "end" ? all.slice(-count) : all.slice(0, count);
}

const orFail = (result) => (result.ok ? result.text : `(${result.text})`);

function summarizeChecks(rollup) {
  const counts = {};
  for (const check of rollup ?? []) {
    const state = check.conclusion || check.state || check.status || "UNKNOWN";
    counts[state] = (counts[state] ?? 0) + 1;
  }
  const summary = Object.entries(counts)
    .map(([state, count]) => `${state} ${count}`)
    .join(", ");
  return summary || "no checks";
}

async function openPullRequests() {
  const result = await run("gh", [
    "pr", "list", "-R", REPO, "--state", "open", "--json", "number,title,headRefName,statusCheckRollup",
  ]);
  if (!result.ok) return orFail(result);
  try {
    const prs = JSON.parse(result.text);
    if (prs.length === 0) return "none";
    return prs.map((pr) => `#${pr.number} ${pr.headRefName} "${pr.title}": ${summarizeChecks(pr.statusCheckRollup)}`).join("\n");
  } catch {
    return "(could not read the pull request list)";
  }
}

async function lastFailedRun() {
  const listed = await run("gh", [
    "run", "list", "-R", REPO, "--status", "failure", "--limit", "1", "--json", "databaseId,displayTitle,headBranch",
  ]);
  if (!listed.ok) return orFail(listed);
  try {
    const [latest] = JSON.parse(listed.text);
    if (!latest) return "none";
    const log = await run("gh", ["run", "view", String(latest.databaseId), "-R", REPO, "--log-failed"]);
    return [`run ${latest.databaseId} on ${latest.headBranch}: ${latest.displayTitle}`, ...lines(orFail(log), 40, "end")].join("\n");
  } catch {
    return "(could not read the run list)";
  }
}

async function portListener(port) {
  if (isWindows) {
    const result = await run("netstat", ["-ano", "-p", "tcp"]);
    if (!result.ok) return orFail(result);
    const row = result.text.split("\n").find((line) => line.includes(`:${port} `) && line.includes("LISTENING"));
    return row ? `pid ${row.trim().split(/\s+/).pop()}` : "nothing listening";
  }
  const result = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  return result.ok && result.text ? `pid ${lines(result.text, 1)[0]}` : "nothing listening";
}

async function gitState() {
  const top = await run("git", ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return { top: null, text: "not inside a git folder" };
  const [branch, status, worktrees] = await Promise.all([
    run("git", ["branch", "--show-current"]),
    run("git", ["status", "-s"]),
    run("git", ["worktree", "list"]),
  ]);
  return {
    top: top.text,
    text: [
      `branch: ${orFail(branch) || "(detached)"}`,
      `git status -s (first 30):\n${lines(orFail(status), 30).join("\n") || "(clean)"}`,
      `git worktree list:\n${orFail(worktrees)}`,
    ].join("\n"),
  };
}

async function signedInAs() {
  const result = await run("gh", ["auth", "status"]);
  const account = result.text.match(/account (\S+)/);
  return account ? account[1] : "not signed in";
}

export async function collectDiagnosis() {
  const [pnpm, git, gh, user, repo, prs, failedRun, port] = await Promise.all([
    run("pnpm", ["--version"]),
    run("git", ["--version"]),
    run("gh", ["--version"]),
    signedInAs(),
    gitState(),
    openPullRequests(),
    lastFailedRun(),
    portListener(3000),
  ]);
  const envLocalAt = repo.top ?? process.cwd();
  const report = [
    `os: ${os.platform()} ${os.release()} ${os.arch()}`,
    `versions: node ${process.version}, pnpm ${orFail(pnpm)}, ${orFail(git)}, ${lines(orFail(gh), 1)[0]}`,
    `gh signed in as: ${user}`,
    `cwd: ${process.cwd()}`,
    repo.text,
    `.env.local present: ${fs.existsSync(path.join(envLocalAt, ".env.local")) ? "yes" : "no"}`,
    `port 3000 listener: ${port}`,
    `open pull requests:\n${prs}`,
    `last failed run:\n${failedRun}`,
  ].join("\n");
  const clipped = report.split("\n").map((line) => (line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)} ...[cut]` : line));
  return redact(clipped.join("\n"));
}
