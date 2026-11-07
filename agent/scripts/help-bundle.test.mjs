import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { appendBundleToReport, buildBundle, detailsBlock, REPORT_BUDGET, STDOUT_BUDGET } from "./help-bundle.mjs";
import { redact } from "./help-bundle-redact.mjs";
import { condenseTranscript, findNewestTranscript, MAX_CHARS, MAX_RESULT_LINES, MAX_TURNS } from "./help-bundle-session.mjs";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "help-session.jsonl");

// Built from pieces so no secret-shaped string sits in the repository, even a fake one.
const SECRETS = {
  PASSWORD: ["Fake", "Pa55w0rd", "Zz9"].join("-"),
  JWT: ["eyJ" + "hbGciOiJIUzI1NiJ9", "eyJ" + "mYWtlIjoicm9sZSJ9", "ZmFrZXNpZ25hdHVyZQ" + "FAKE"].join("."),
  SB_SECRET: "sb_secret_" + "FAKEfake0123456789abcdefXYZ",
  SB_PUBLISHABLE: "sb_publishable_" + "FAKEfake0123456789abcdefXYZ",
  POSTGRES_URL: "postgresql://postgres.fakeref:" + "Fake-Db-Pa55-Qq7" + "@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
  GH_TOKEN: "gh" + "p_" + "FAKEfake0123456789abcdefABCDEFGHIJ",
  BEARER: "FAKEbearer" + "Value0123456789",
  RESEND: "re_" + "FAKEresend0123456789",
};

// Fragments that identify a leaked secret; the prefixes sb_secret_ and sb_publishable_ may stay.
const LEAK_NEEDLES = [
  "Pa55w0rd",
  "Fake-Db-Pa55-Qq7",
  "mYWtlIjoicm9sZSJ9",
  "ZmFrZXNpZ25hdHVyZQ",
  "FAKEfake0123456789abcdef",
  "ABCDEFGHIJ",
  "Value0123456789",
  "FAKEresend",
];

function loadFixture() {
  return fs.readFileSync(FIXTURE, "utf8").replace(/\{\{(\w+)\}\}/g, (_, name) => SECRETS[name]);
}

test("redact removes every kind of secret and keeps the Supabase key prefixes", () => {
  const out = redact(
    [
      `key ${SECRETS.SB_SECRET} and ${SECRETS.SB_PUBLISHABLE}`,
      `jwt ${SECRETS.JWT}`,
      `url ${SECRETS.POSTGRES_URL}`,
      `gh ${SECRETS.GH_TOKEN}`,
      `curl -H "Authorization: Bearer ${SECRETS.BEARER}"`,
      `Bearer ${SECRETS.BEARER}`,
      `password: ${SECRETS.PASSWORD}`,
      `db_password=${SECRETS.PASSWORD}`,
      `{"password":"${SECRETS.PASSWORD}"}`,
      `FOO_API_KEY=${SECRETS.RESEND} pnpm dev`,
      `export PLAIN_NAME=${SECRETS.RESEND}`,
    ].join("\n"),
  );
  for (const needle of LEAK_NEEDLES) assert.ok(!out.includes(needle), `leaked: ${needle}`);
  assert.match(out, /sb_secret_<REDACTED>/);
  assert.match(out, /sb_publishable_<REDACTED>/);
  assert.match(out, /postgresql:\/\/postgres\.fakeref:<REDACTED>@aws-0/);
});

test("redact leaves ordinary text alone", () => {
  const text = "Basic information about the pull request\nrun pnpm test on branch feat/x";
  assert.equal(redact(text), text);
});

test("condensed fixture never contains a secret", () => {
  const out = condenseTranscript(loadFixture());
  for (const needle of LEAK_NEEDLES) assert.ok(!out.includes(needle), `leaked: ${needle}`);
  assert.ok(out.includes("<REDACTED"));
});

test("condensed fixture reads as turns, one-line tool calls and trimmed output", () => {
  const out = condenseTranscript(loadFixture());
  assert.match(out, /^User: Please connect/m);
  assert.match(out, /^Claude: I will read the settings file\./m);
  assert.match(out, /^ {2}Read: \/Users\/vicky\/GQ\/gq-projects-crm\/README\.md$/m);
  assert.ok(!out.includes("hidden thoughts"));
  assert.ok(out.includes("line 20"));
  assert.ok(!out.includes("must be cut"));
  assert.match(out, /\.\.\. 3 more lines/);
});

test("only the last turns are kept", () => {
  const records = Array.from({ length: MAX_TURNS + 10 }, (_, i) =>
    JSON.stringify({ type: i % 2 ? "assistant" : "user", message: { content: `turn number ${i}` } }),
  );
  const out = condenseTranscript(records.join("\n"));
  assert.ok(!out.includes("turn number 9\n") && !out.endsWith("turn number 9"));
  assert.ok(out.includes("turn number 10"));
  assert.ok(out.includes(`turn number ${MAX_TURNS + 9}`));
  assert.equal(out.split("\n").length, MAX_TURNS);
});

test("output never exceeds the size cap plus its marker", () => {
  const fat = "x".repeat(1_900);
  const records = Array.from({ length: MAX_TURNS }, (_, i) =>
    JSON.stringify({ type: i % 2 ? "assistant" : "user", message: { content: `${i} ${fat}` } }),
  );
  const out = condenseTranscript(records.join("\n"));
  assert.ok(out.length <= MAX_CHARS + 100, `length ${out.length}`);
  assert.match(out, /^\[earlier part cut/);
  assert.ok(out.includes(`${MAX_TURNS - 1} xxx`));
});

test("a tool result is trimmed to the line cap", () => {
  const lines = Array.from({ length: 100 }, (_, i) => `row ${i}`).join("\n");
  const record = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "a", content: lines }] } };
  const out = condenseTranscript(JSON.stringify(record));
  assert.equal(out.split("\n").length, MAX_RESULT_LINES + 1);
});

test("the newest session file wins and subfolders are ignored", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "help-bundle-"));
  try {
    const project = path.join(root, "-proj");
    fs.mkdirSync(path.join(project, "sub"), { recursive: true });
    const older = path.join(project, "old.jsonl");
    const newer = path.join(project, "new.jsonl");
    fs.writeFileSync(older, "{}");
    fs.writeFileSync(newer, "{}");
    fs.writeFileSync(path.join(project, "sub", "agent.jsonl"), "{}");
    fs.utimesSync(older, new Date(2020, 0, 1), new Date(2020, 0, 1));
    fs.utimesSync(path.join(project, "sub", "agent.jsonl"), new Date(2030, 0, 1), new Date(2030, 0, 1));
    assert.equal(findNewestTranscript(root), newer);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the fence outgrows any backticks inside the body", () => {
  const block = detailsBlock("Title", "before ````` after");
  assert.ok(block.includes("``````text\n"));
});

function projectsRootWithBigSession(root) {
  const projects = path.join(root, "projects");
  fs.mkdirSync(path.join(projects, "-proj"), { recursive: true });
  const turns = Array.from({ length: MAX_TURNS }, (_, i) =>
    JSON.stringify({ type: i % 2 ? "assistant" : "user", message: { content: `${i} ${"y".repeat(1_900)}` } }),
  );
  fs.writeFileSync(path.join(projects, "-proj", "session.jsonl"), turns.join("\n"));
  return projects;
}

test("--append keeps the whole report under the budget and keeps the newest turns", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "help-bundle-"));
  try {
    const projects = projectsRootWithBigSession(root);
    const report = path.join(root, "GQ", ".help-report.md");
    fs.mkdirSync(path.dirname(report));
    fs.writeFileSync(report, `Asked: something\n${"e".repeat(20_000)}\n`);
    const total = await appendBundleToReport(report, projects);
    const written = fs.readFileSync(report, "utf8");
    assert.equal(written.length, total);
    assert.ok(written.length <= REPORT_BUDGET, `length ${written.length}`);
    assert.match(written, /earlier part cut/);
    assert.ok(written.includes(`${MAX_TURNS - 1} yyy`));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("--append leaves the transcript out when the report already fills the budget", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "help-bundle-"));
  try {
    const report = path.join(root, ".help-report.md");
    fs.writeFileSync(report, "e".repeat(REPORT_BUDGET - 500));
    await appendBundleToReport(report, projectsRootWithBigSession(root));
    const written = fs.readFileSync(report, "utf8");
    assert.match(written, /left out/);
    assert.ok(written.length <= REPORT_BUDGET, `length ${written.length}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stdout mode caps the bundle", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "help-bundle-"));
  try {
    const bundle = await buildBundle({ projectsRoot: projectsRootWithBigSession(root) });
    assert.ok(bundle.length <= STDOUT_BUDGET, `length ${bundle.length}`);
    assert.equal((bundle.match(/<details>/g) ?? []).length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
