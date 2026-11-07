// Condense a Claude Code session transcript (JSONL) into a short, redacted, readable log.
// Line shape: {type: "user"|"assistant", message: {content: string | block[]}}; blocks are
// text, thinking, tool_use {name, input} and tool_result {tool_use_id, content}. Other line types are skipped.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { redact } from "./help-bundle-redact.mjs";

export const MAX_TURNS = 40;
export const MAX_RESULT_LINES = 20;
export const MAX_CHARS = 50_000;
const MAX_TURN_CHARS = 2_000;
const MAX_LINE_CHARS = 300;
const CUT_MARK = "[earlier part cut to fit the size limit]";

function clip(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)} ...[cut]` : text;
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function summarizeToolInput(input) {
  if (typeof input !== "object" || input === null) return "";
  const main = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.description;
  const summary = typeof main === "string" ? main : JSON.stringify(input);
  return summary.replace(/\s*\n\s*/g, " ; ");
}

function resultLines(content) {
  const lines = textOf(content).split("\n");
  const kept = lines.slice(0, MAX_RESULT_LINES).map((line) => clip(line, MAX_LINE_CHARS));
  if (lines.length > MAX_RESULT_LINES) kept.push(`... ${lines.length - MAX_RESULT_LINES} more lines`);
  return kept.map((line) => `    ${line}`).join("\n");
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// Entries in order: {turn: true, text} for what was said, {turn: false, text} for tool calls and output.
function readEntries(jsonlText) {
  const entries = [];
  for (const line of jsonlText.split("\n")) {
    const record = line.trim() ? parseLine(line) : null;
    const role = record?.type;
    if ((role !== "user" && role !== "assistant") || record.isMeta) continue;
    const content = record.message?.content;
    const said = textOf(content).trim();
    if (said) entries.push({ turn: true, text: `${role === "user" ? "User" : "Claude"}: ${clip(redact(said), MAX_TURN_CHARS)}` });
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_use") {
        entries.push({ turn: false, text: `  ${block.name}: ${clip(redact(summarizeToolInput(block.input)), MAX_LINE_CHARS)}` });
      } else if (block?.type === "tool_result") {
        const output = resultLines(block.content);
        if (output.trim()) entries.push({ turn: false, text: redact(output) });
      }
    }
  }
  return entries;
}

export function condenseTranscript(jsonlText, maxChars = MAX_CHARS) {
  const entries = readEntries(jsonlText);
  const turnIndexes = entries.flatMap((entry, index) => (entry.turn ? [index] : []));
  const start = turnIndexes.length > MAX_TURNS ? turnIndexes[turnIndexes.length - MAX_TURNS] : 0;
  let log = entries.slice(start).map((entry) => entry.text).join("\n");
  const room = maxChars - CUT_MARK.length - 1;
  if (log.length > maxChars) log = room > 0 ? `${CUT_MARK}\n${log.slice(log.length - room)}` : CUT_MARK.slice(0, Math.max(0, maxChars));
  return redact(log);
}

// Newest session file across all projects; subfolders hold subagent logs, not her session.
export function findNewestTranscript(root = path.join(os.homedir(), ".claude", "projects")) {
  let newest = null;
  for (const project of fs.readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(root, project.name))) {
      if (!file.endsWith(".jsonl")) continue;
      const full = path.join(root, project.name, file);
      const modified = fs.statSync(full).mtimeMs;
      if (!newest || modified > newest.modified) newest = { file: full, modified };
    }
  }
  return newest?.file ?? null;
}
