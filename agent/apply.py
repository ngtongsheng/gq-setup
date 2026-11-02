"""Install or refresh the GQ company agent layer in ~/.claude.

Runs from setup and from the SessionStart hook. Every step checks before it
changes anything, so a second run is a no-op. Stdlib only: this runs on the
Apple Command Line Tools python3.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
IMPORT_LINE = "@~/GQ/gq-setup/agent/CLAUDE.md"
RTK_SHIM = "$HOME/.local/share/mise/shims/rtk"

quiet = False


def say(message):
    if not quiet:
        print(message)


def warn(message):
    print(f"gq apply: {message}", file=sys.stderr)


def home(*parts):
    return os.path.join(os.environ["HOME"], *parts)


def write_atomically(path, text):
    folder = os.path.dirname(path)
    os.makedirs(folder, exist_ok=True)
    handle, temp_path = tempfile.mkstemp(dir=folder, prefix=".gq-apply-")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as temp_file:
            temp_file.write(text)
        os.replace(temp_path, path)
    except BaseException:
        os.unlink(temp_path)
        raise


def pull_setup_repo():
    repo = home("GQ", "gq-setup")
    if not os.path.isdir(os.path.join(repo, ".git")):
        return

    def git(*args):
        result = subprocess.run(
            ["/usr/bin/git", "-C", repo, *args],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            raise RuntimeError(f"git {args[0]} failed: {result.stderr.strip()}")
        return result.stdout.strip()

    if git("branch", "--show-current") != "main" or git("status", "--porcelain"):
        say("pull: gq-setup is not on a clean main, left as it is")
        return
    git("pull", "--ff-only", "-q")
    say("pull: gq-setup up to date")


def ensure_import_line():
    path = home(".claude", "CLAUDE.md")
    existing = ""
    if os.path.exists(path):
        with open(path, encoding="utf-8") as claude_md:
            existing = claude_md.read()
    lines = existing.splitlines(keepends=True)
    if lines and lines[0].rstrip("\r\n") == IMPORT_LINE and not any(
        line.rstrip("\r\n") == IMPORT_LINE for line in lines[1:]
    ):
        return
    rest = [line for line in lines if line.rstrip("\r\n") != IMPORT_LINE]
    write_atomically(path, IMPORT_LINE + "\n" + "".join(rest))
    say("import: company rules linked in ~/.claude/CLAUDE.md")


def ensure_link(link_path, target):
    if os.path.islink(link_path):
        if os.readlink(link_path) == target:
            return
        warn(f"{link_path} already links somewhere else, left as it is")
        return
    if os.path.exists(link_path):
        warn(f"{link_path} already exists and is not a link, left as it is")
        return
    os.makedirs(os.path.dirname(link_path), exist_ok=True)
    os.symlink(target, link_path)
    say(f"link: {link_path}")


def link_style_and_skills():
    ensure_link(
        home(".claude", "output-styles", "plain.md"),
        os.path.join(AGENT_DIR, "output-styles", "plain.md"),
    )
    skills_dir = os.path.join(AGENT_DIR, "skills")
    for name in sorted(os.listdir(skills_dir)):
        target = os.path.join(skills_dir, name)
        if os.path.isdir(target):
            ensure_link(home(".claude", "skills", name), target)


def hook_commands(group):
    return {hook.get("command") for hook in group.get("hooks", [])}


def merge_hooks(theirs, ours):
    """Per event, a company group replaces any of hers running the same command."""
    merged = dict(theirs)
    for event, our_groups in ours.items():
        groups = list(theirs.get(event, []))
        for our_group in our_groups:
            commands = hook_commands(our_group)
            groups = [group for group in groups if not hook_commands(group) & commands]
            groups.append(our_group)
        merged[event] = groups
    return merged


def merge(theirs, ours):
    """Company keys win; her other keys stay; lists are unioned in order."""
    if isinstance(theirs, dict) and isinstance(ours, dict):
        merged = dict(theirs)
        for key, value in ours.items():
            merged[key] = merge(theirs[key], value) if key in theirs else value
        return merged
    if isinstance(theirs, list) and isinstance(ours, list):
        return theirs + [item for item in ours if item not in theirs]
    return ours


def company_settings():
    with open(os.path.join(AGENT_DIR, "settings.json"), encoding="utf-8") as settings_file:
        settings = json.load(settings_file)
    rtk_path = os.path.expandvars(RTK_SHIM)
    if not os.path.exists(rtk_path):
        hooks = settings.get("hooks", {})
        hooks["PreToolUse"] = [
            group
            for group in hooks.get("PreToolUse", [])
            if not any(RTK_SHIM in (command or "") for command in hook_commands(group))
        ]
        if not hooks["PreToolUse"]:
            del hooks["PreToolUse"]
    return settings


def merge_settings():
    path = home(".claude", "settings.json")
    theirs = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as settings_file:
            try:
                theirs = json.load(settings_file)
            except json.JSONDecodeError:
                warn(f"{path} is not valid JSON, left as it is")
                return
        if not isinstance(theirs, dict):
            warn(f"{path} is not a JSON object, left as it is")
            return
    ours = company_settings()
    hooks = merge_hooks(theirs.get("hooks", {}), ours.pop("hooks", {}))
    merged = merge(theirs, ours)
    if hooks:
        merged["hooks"] = hooks
    if merged == theirs:
        return
    write_atomically(path, json.dumps(merged, indent=2) + "\n")
    say("settings: company settings merged into ~/.claude/settings.json")


def remove_stale_skill_links():
    skills_dir = home(".claude", "skills")
    if not os.path.isdir(skills_dir):
        return
    ours = os.path.join(AGENT_DIR, "skills") + os.sep
    for name in os.listdir(skills_dir):
        link_path = os.path.join(skills_dir, name)
        if not os.path.islink(link_path):
            continue
        target = os.readlink(link_path)
        if target.startswith(ours) and not os.path.exists(target):
            os.unlink(link_path)
            say(f"removed: {link_path} (skill no longer shipped)")


STEPS = [
    ("pull", pull_setup_repo),
    ("import", ensure_import_line),
    ("links", link_style_and_skills),
    ("settings", merge_settings),
    ("cleanup", remove_stale_skill_links),
]


def main():
    global quiet
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quiet", action="store_true", help="print only problems; always exit 0")
    quiet = parser.parse_args().quiet

    failed = False
    for name, step in STEPS:
        try:
            step()
        except Exception as error:
            warn(f"{name} step failed: {error}")
            failed = True
    return 1 if failed and not quiet else 0


if __name__ == "__main__":
    sys.exit(main())
