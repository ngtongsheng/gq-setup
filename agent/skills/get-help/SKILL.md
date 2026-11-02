---
name: get-help
description: Ask Tong Sheng for help through a GitHub issue assigned to him, from any folder. Use when a step needs his accounts, passwords, payment or settings, when two fix attempts have failed, when something may be unsafe, or when the CRM's own list says so (safety checks failing, migration guard blocked, change to who sees what, deleting or reshaping records).
---
# Get help

Hands a problem to Tong Sheng (GitHub `ngtongsheng`) as a **report** he can act on without asking her anything, then
tells Vicky in plain words where things stand.

## When
Inside the CRM (your folder is `~/GQ/gq-projects-crm` or below), call it when the CRM `CLAUDE.md` "Call get-help when"
list applies. In any other folder, call it when:
- two fix attempts for the same problem have failed;
- a step needs an account, password, payment or setting only Tong Sheng has;
- you are unsure the change is safe (it could lose, expose or overwrite something that matters).

## 1. Write the report
Everything technical goes here, never to her:
- **Asked:** what she wanted, in her words.
- **Blocked on:** the failing step and why you stopped (retry used, needs his access, unsure it is safe; inside the CRM
  also a guard block).
- **Evidence:** the failing command and the relevant log lines (`gh run view <run-id> -R ngtongsheng/gq-projects-crm --log-failed`, trimmed to the
  error), or the guard's output. Redact secrets as `<REDACTED>`.
- **Where:** the folder, and when there is one: branch, pull request link, merge sha if merged, and whether the live
  app changed.
- **Next:** what you would do with his go-ahead (for a guard block: the exact statements it flagged).

## 2. File it
Every `gh` command here names the CRM repository with `-R ngtongsheng/gq-projects-crm`, so it works from any folder
and the issue always lands where Tong Sheng looks.
1. Write the report with the Write tool to `$HOME/GQ/.help-report.md` (written as an absolute path; it sits outside
   every repository so it can never be committed, and is overwritten each time), so log lines with quotes survive
   intact.
2. Pick the label: `from:crm` when `pwd` is inside `~/GQ/gq-projects-crm`, otherwise `from:other`. Make sure it exists:
   `gh label create "<label>" -R ngtongsheng/gq-projects-crm --force`.
3. Look for an open report on the same problem: `gh issue list -R ngtongsheng/gq-projects-crm --assignee ngtongsheng
   --state open --search "<branch or short problem>"`.
   Found: `gh issue comment <n> -R ngtongsheng/gq-projects-crm --body-file "$HOME/GQ/.help-report.md"`.
4. Otherwise: `gh issue create -R ngtongsheng/gq-projects-crm --assignee ngtongsheng --label "<label>" --title "Help:
   <short problem>" --body-file "$HOME/GQ/.help-report.md"`. Start the title with "Urgent:" instead of "Help:" when
   the live app is affected.
5. Done when the command prints the issue link. If `gh` itself fails (offline, signed out), skip the report and tell
   her: "I couldn't reach Tong Sheng automatically. Please message him that your change is stuck."

## 3. Tell her
One or two lines, in glossary words, with no link and no detail from the report:
- that Tong Sheng has been told and will pick it up;
- what it means right now ("the live app is unchanged", or "your change is saved as a draft");
- what she can keep doing: start another change, keep using the app, or wait for this one.
