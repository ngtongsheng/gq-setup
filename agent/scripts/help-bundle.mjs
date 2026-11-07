// Build the help bundle for a get-help report: a diagnosis plus her condensed, redacted session transcript,
// each in a collapsed <details> block. Node standard library only.
// Usage: node help-bundle.mjs            print the bundle
//        node help-bundle.mjs --append   append it to ~/GQ/.help-report.md (written by get-help)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectDiagnosis } from "./help-bundle-diagnosis.mjs";
import { condenseTranscript, findNewestTranscript } from "./help-bundle-session.mjs";

// A fence longer than any backtick run inside keeps pasted markdown from breaking out of the block.
export function detailsBlock(title, body) {
  const longestRun = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `<details>\n<summary>${title}</summary>\n\n${fence}text\n${body}\n${fence}\n\n</details>`;
}

// stdout mode stays well under GitHub's 65,536-character issue limit; --append also counts what get-help already wrote.
export const STDOUT_BUDGET = 45_000;
export const REPORT_BUDGET = 60_000;
const FENCE_MARGIN = 50;
const MIN_SESSION_CHARS = 200;

function readSession(maxChars, projectsRoot) {
  try {
    const file = findNewestTranscript(projectsRoot);
    if (!file) return "(no session transcript found)";
    return condenseTranscript(fs.readFileSync(file, "utf8"), maxChars) || "(session transcript was empty)";
  } catch (error) {
    return `(could not read the session transcript: ${error.message})`;
  }
}

const OMITTED_NOTE = "(session transcript left out: the report is already near the size limit)";

// The transcript is the flexible part: it shrinks (newest turns kept) so the whole bundle fits `budget`.
// When even the diagnosis does not fit, the diagnosis keeps its first lines and the transcript is left out.
export async function buildBundle({ budget = STDOUT_BUDGET, projectsRoot } = {}) {
  const sessionTitle = "Session transcript (last turns, secrets redacted)";
  const diagnosis = await collectDiagnosis();
  const wrappers = detailsBlock("Diagnosis", "").length + detailsBlock(sessionTitle, "").length + 3 + FENCE_MARGIN;
  const sessionRoom = budget - wrappers - diagnosis.length;
  const sessionBody = sessionRoom < MIN_SESSION_CHARS ? OMITTED_NOTE : readSession(sessionRoom, projectsRoot);
  const diagnosisRoom = budget - wrappers - sessionBody.length;
  const diagnosisBody = diagnosis.length > diagnosisRoom ? diagnosis.slice(0, Math.max(0, diagnosisRoom)) : diagnosis;
  return `${detailsBlock("Diagnosis", diagnosisBody)}\n\n${detailsBlock(sessionTitle, sessionBody)}\n`;
}

export async function appendBundleToReport(reportPath, projectsRoot) {
  const existing = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : "";
  const bundle = await buildBundle({ budget: REPORT_BUDGET - existing.length - 1, projectsRoot });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.appendFileSync(reportPath, `\n${bundle}`, "utf8");
  return existing.length + 1 + bundle.length;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  if (process.argv.includes("--append")) {
    const target = path.join(os.homedir(), "GQ", ".help-report.md");
    const total = await appendBundleToReport(target);
    console.log(`help bundle appended to ${target} (report is now ${total} characters)`);
  } else {
    console.log(await buildBundle());
  }
}
