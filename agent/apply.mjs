// Install or refresh the GQ company agent layer in ~/.claude.
//
// Runs from setup and from the SessionStart hook. Every step checks before it
// changes anything, so a second run is a no-op. Node standard library only.
// Usage: node apply.mjs [--quiet]   (--quiet prints only problems and always exits 0)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

const AGENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const IMPORT_LINE = "@~/GQ/gq-setup/agent/CLAUDE.md";
const RTK_SHIM = "$HOME/.local/share/mise/shims/rtk";
// Windows without developer mode cannot symlink, so those links become copies.
const SYMLINK_DENIED = new Set(["EPERM", "EACCES", "ENOTSUP", "EINVAL", "UNKNOWN"]);

const quiet = process.argv.includes("--quiet");

function say(message) {
  if (!quiet) console.log(message);
}

function warn(message) {
  console.error(`gq apply: ${message}`);
}

function home(...parts) {
  return path.join(os.homedir(), ...parts);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function writeAtomically(target, text) {
  const folder = path.dirname(target);
  fs.mkdirSync(folder, { recursive: true });
  const tempPath = path.join(folder, `.gq-apply-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(tempPath, text, "utf8");
    fs.renameSync(tempPath, target);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

function git(repo, ...args) {
  const result = spawnSync(process.platform === "darwin" ? "/usr/bin/git" : "git", ["-C", repo, ...args], {
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.error) throw new Error(`git ${args[0]} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function pullSetupRepo() {
  const repo = home("GQ", "gq-setup");
  if (!fs.existsSync(path.join(repo, ".git"))) return;
  if (git(repo, "branch", "--show-current") !== "main" || git(repo, "status", "--porcelain")) {
    say("pull: gq-setup is not on a clean main, left as it is");
    return;
  }
  git(repo, "pull", "--ff-only", "-q");
  say("pull: gq-setup up to date");
}

function ensureImportLine() {
  const target = home(".claude", "CLAUDE.md");
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  const isImport = (line) => line.replace(/\r?\n$/, "") === IMPORT_LINE;
  const lines = existing.split(/(?<=\n)/).filter((line) => line !== "");
  if (lines.length > 0 && isImport(lines[0]) && !lines.slice(1).some(isImport)) return;
  const rest = lines.filter((line) => !isImport(line));
  writeAtomically(target, `${IMPORT_LINE}\n${rest.join("")}`);
  say("import: company rules linked in ~/.claude/CLAUDE.md");
}

// Copies made where symlinks are not allowed. Remembered so a later run can
// tell them from files she made herself and refresh them.
const copiesFile = home(".claude", ".gq-apply-copies.json");

function readCopies() {
  try {
    const parsed = JSON.parse(fs.readFileSync(copiesFile, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeCopies(copies) {
  if (isDeepStrictEqual(copies, readCopies())) return;
  if (copies.length === 0) {
    fs.rmSync(copiesFile, { force: true });
    return;
  }
  writeAtomically(copiesFile, `${JSON.stringify(copies, null, 2)}\n`);
}

function snapshot(root) {
  const entries = [];
  const walk = (current) => {
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current).sort()) walk(path.join(current, name));
    } else {
      entries.push(`${path.relative(root, current)}\0${fs.readFileSync(current).toString("base64")}`);
    }
  };
  walk(root);
  return entries.join("\n");
}

function copyOver(linkPath, target) {
  fs.rmSync(linkPath, { recursive: true, force: true });
  fs.cpSync(target, linkPath, { recursive: true });
}

function ensureLink(linkPath, target, copies) {
  const existing = lstatOrNull(linkPath);
  if (existing?.isSymbolicLink()) {
    if (path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath)) === path.resolve(target)) return;
    warn(`${linkPath} already links somewhere else, left as it is`);
    return;
  }
  if (existing) {
    if (!copies.has(linkPath)) {
      warn(`${linkPath} already exists and is not a link, left as it is`);
      return;
    }
    if (snapshot(linkPath) !== snapshot(target)) {
      copyOver(linkPath, target);
      say(`copy: ${linkPath} refreshed`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  try {
    // A junction needs no admin rights on Windows and is ignored elsewhere.
    fs.symlinkSync(target, linkPath, fs.statSync(target).isDirectory() ? "junction" : "file");
    say(`link: ${linkPath}`);
  } catch (error) {
    if (!SYMLINK_DENIED.has(error.code)) throw error;
    copyOver(linkPath, target);
    copies.add(linkPath);
    say(`copy: ${linkPath} (links are not allowed here)`);
  }
}

function linkStyleAndSkills() {
  const copies = new Set(readCopies());
  try {
    ensureLink(home(".claude", "output-styles", "plain.md"), path.join(AGENT_DIR, "output-styles", "plain.md"), copies);
    const skillsDir = path.join(AGENT_DIR, "skills");
    for (const name of fs.readdirSync(skillsDir).sort()) {
      const target = path.join(skillsDir, name);
      if (fs.statSync(target).isDirectory()) ensureLink(home(".claude", "skills", name), target, copies);
    }
  } finally {
    writeCopies([...copies]);
  }
}

function hookCommands(group) {
  return new Set((group.hooks ?? []).map((hook) => hook.command));
}

// Per event, a company group replaces any of hers running the same command.
function mergeHooks(theirs, ours) {
  const merged = { ...theirs };
  for (const [event, ourGroups] of Object.entries(ours)) {
    let groups = [...(theirs[event] ?? [])];
    for (const ourGroup of ourGroups) {
      const commands = hookCommands(ourGroup);
      groups = groups.filter((group) => ![...hookCommands(group)].some((command) => commands.has(command)));
      groups.push(ourGroup);
    }
    merged[event] = groups;
  }
  return merged;
}

// Company keys win; her other keys stay; lists are unioned in order.
function merge(theirs, ours) {
  if (isPlainObject(theirs) && isPlainObject(ours)) {
    const merged = { ...theirs };
    for (const [key, value] of Object.entries(ours)) {
      merged[key] = Object.hasOwn(theirs, key) ? merge(theirs[key], value) : value;
    }
    return merged;
  }
  if (Array.isArray(theirs) && Array.isArray(ours)) {
    return [...theirs, ...ours.filter((item) => !theirs.some((known) => isDeepStrictEqual(known, item)))];
  }
  return ours;
}

function companySettings() {
  const settings = JSON.parse(fs.readFileSync(path.join(AGENT_DIR, "settings.json"), "utf8"));
  // The rtk hook only makes sense where rtk is installed.
  if (!fs.existsSync(home(".local", "share", "mise", "shims", "rtk"))) {
    const hooks = settings.hooks ?? {};
    hooks.PreToolUse = (hooks.PreToolUse ?? []).filter(
      (group) => ![...hookCommands(group)].some((command) => (command ?? "").includes(RTK_SHIM)),
    );
    if (hooks.PreToolUse.length === 0) delete hooks.PreToolUse;
  }
  return settings;
}

function mergeSettings() {
  const target = home(".claude", "settings.json");
  let theirs = {};
  if (fs.existsSync(target)) {
    try {
      theirs = JSON.parse(fs.readFileSync(target, "utf8"));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      warn(`${target} is not valid JSON, left as it is`);
      return;
    }
    if (!isPlainObject(theirs)) {
      warn(`${target} is not a JSON object, left as it is`);
      return;
    }
  }
  const { hooks: ourHooks = {}, ...ours } = companySettings();
  const hooks = mergeHooks(theirs.hooks ?? {}, ourHooks);
  const merged = merge(theirs, ours);
  if (Object.keys(hooks).length > 0) merged.hooks = hooks;
  if (isDeepStrictEqual(merged, theirs)) return;
  writeAtomically(target, `${JSON.stringify(merged, null, 2)}\n`);
  say("settings: company settings merged into ~/.claude/settings.json");
}

function removeStaleSkillLinks() {
  const skillsDir = home(".claude", "skills");
  if (!fs.existsSync(skillsDir)) return;
  const ours = path.join(AGENT_DIR, "skills") + path.sep;
  for (const name of fs.readdirSync(skillsDir)) {
    const linkPath = path.join(skillsDir, name);
    if (!lstatOrNull(linkPath)?.isSymbolicLink()) continue;
    const target = fs.readlinkSync(linkPath);
    if (target.startsWith(ours) && !fs.existsSync(target)) {
      fs.unlinkSync(linkPath);
      say(`removed: ${linkPath} (skill no longer shipped)`);
    }
  }
}

function removeStaleCopies() {
  const copies = readCopies();
  const kept = copies.filter((copyPath) => {
    if (!lstatOrNull(copyPath)) return false;
    const source = path.join(AGENT_DIR, path.basename(path.dirname(copyPath)), path.basename(copyPath));
    if (fs.existsSync(source)) return true;
    fs.rmSync(copyPath, { recursive: true, force: true });
    say(`removed: ${copyPath} (no longer shipped)`);
    return false;
  });
  writeCopies(kept);
}

const STEPS = [
  ["pull", pullSetupRepo],
  ["import", ensureImportLine],
  ["links", linkStyleAndSkills],
  ["settings", mergeSettings],
  ["cleanup", removeStaleSkillLinks],
  ["cleanup", removeStaleCopies],
];

let failed = false;
for (const [name, step] of STEPS) {
  try {
    step();
  } catch (error) {
    warn(`${name} step failed: ${error.message}`);
    failed = true;
  }
}
process.exitCode = failed && !quiet ? 1 : 0;
