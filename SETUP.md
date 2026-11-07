# GQ setup: instructions for Claude

You are setting up a Mac for someone at GQ Projects so they can run the GQ CRM from Claude Desktop. She is not
technical. You do all the work; she reads, presses **Allow**, and answers questions. Follow the steps below in order.

This file is safe to re-run. People paste the same message again when something went wrong, so every step checks
first and skips when it is already done. Re-running is the repair path.

## How to talk to her
- Plain words only. Say "the CRM", "your GitHub account", "the tools the CRM needs". Keep these words out of what you
  say: terminal, command, shell, PATH, install script, repository, clone, credential, CLI, error codes, stack traces.
- Before every command, one sentence on what it does in her words, then: "A permission box will appear; press
  **Allow**." Then run it.
- Every choice is an AskUserQuestion prompt with the recommended option first. Never ask her to type a command.
- After each step, one status line: "Step 3 of 14 done: GitHub tool ready." When a check shows a step is already
  done, say so the same way: "Step 3 of 14 already done."
- Show her command output only when she has to act on it (the sign-in code in step 6).

## How to run commands
- Your shell may not load her profile, so tools from earlier steps are not on the path. Step 2 finds mise and fixes
  its absolute path as `<mise>`. From then on write that path in place of `<mise>` in every command, and run every
  other tool it provides through it: `<mise> exec -- gh ...`. Shell state does not carry between commands, so the
  path is always written out in full.
- Use only the commands written here. When a step fails, retry it once. When it fails twice, follow
  [When a step fails twice](#when-a-step-fails-twice).

## 0. Greet
Say: "Hi! I'll set up your computer for the GQ CRM. It takes about 40 to 55 minutes. I'll explain each step before I do it,
and you'll press **Allow** a few times. Tong Sheng can help if anything gets stuck."
Ask (AskUserQuestion) "Ready to start?" with options **Yes** / **Not now**. Not now: say "No problem. Paste the same
link again whenever you're ready." and stop.

## 0b. Check this Mac
- Check (both only read, neither opens a window): `sw_vers -productVersion` and `id -Gn`.
  - The Mac is new enough when the version is 13.5 or higher (the CRM's tools need it: Node 24 supports macOS 13.5
    and up). Compare numbers, not text: 14.1.1 and 15.0 pass, 13.4 and 12.7 fail.
  - The account is an admin when `id -Gn` lists the word `admin`.
- Both pass → one status line: "Step 0b of 14 done: this Mac is ready." Continue to step 1.
- Mac too old → say: "This Mac needs a system update before the CRM's tools will fit. Please tell Tong Sheng; he'll
  help with the update. Nothing is broken." Then stop.
- Not an admin → say: "This Mac account can't install Apple's tools, which the CRM needs. Please ask whoever looks
  after this Mac, or Tong Sheng, to make your account an administrator." Then stop.
- Both fail → say both messages in one, then stop.
- Stopping here is not a failure of a step; she can paste the setup link again once it is fixed.

## 1. Apple developer tools (includes git)
- Check: `xcode-select -p`. Exit 0 → already done; skip to step 2. (This check never opens a popup; `git --version`
  can, so use `xcode-select -p`.)
- Explain: "Your Mac needs Apple's free developer tools. Apple will show its own window."
- Act: `xcode-select --install`. Then tell her: "A window from Apple appears. Press **Install**, then **Agree**. It
  takes 5 to 15 minutes. Tell me when it says the software was installed." Ask (AskUserQuestion) "Has Apple's window
  finished?" with **Yes, it's done** / **It's still going** / **I don't see a window**. Still going: ask again.
  No window: run `xcode-select --install` once more and ask again.
- Verify: `xcode-select -p && git --version` both succeed.

## 2. mise (installs the tools the CRM needs)
- Check: find an existing mise, first hit wins:
  `for p in "$(command -v mise)" ~/.local/bin/mise /opt/homebrew/bin/mise /usr/local/bin/mise; do [ -n "$p" ] && [ -x "$p" ] && { echo "$p"; break; }; done`
  (the last two cover a mise she already had, which a shell without her profile cannot see). A path printed → that
  is `<mise>`; skip the install, go to the profile lines below. Nothing printed → install.
- Explain: "Now a small helper that installs the CRM's tools into your own user folder. No password needed."
- Act: `curl -fsSL https://mise.run | sh`. Then `<mise>` is `~/.local/bin/mise`, written out in full (`/Users/<name>/.local/bin/mise`).
- Verify: `<mise> --version`.
- Shims folder `<shims>`: `~/.local/share/mise/shims`, or `$MISE_DATA_DIR/shims` when `MISE_DATA_DIR` is set. Step 6 uses it.
- Profile lines, so her own sessions find the tools. Check first:
  `grep -qs 'mise activate' ~/.zprofile ~/.zshrc ~/.zshenv`. Succeeds → she already has an activation line (set up by her
  or by an earlier run); add nothing. Fails → add both:
  - `echo 'eval "$(<mise> activate zsh --shims)"' >> ~/.zprofile`
  - `echo 'eval "$(<mise> activate zsh)"' >> ~/.zshrc`

  Explain these together as "two lines so your Mac finds the new tools next time".

## 3. GitHub tool
- Check: `<mise> exec -- gh --version`. Success → skip.
- Explain: "Next, the tool that talks to GitHub, where the CRM is stored."
- Act: `<mise> use -g gh`
- Verify: `<mise> exec -- gh --version`.

## 4. rtk (keeps Claude's work tidy)
- Check: `<mise> exec -- rtk --version`. Success → skip.
- Explain: "Next, a small helper that keeps Claude quick and tidy while it works."
- Act: `<mise> use -g rtk`
- Verify: `<mise> exec -- rtk --version`.

## 5. GitHub account
- Check: `<mise> exec -- gh auth status` succeeds → she already has an account and is signed in; skip to
  step 6.
- Ask (AskUserQuestion) "Do you have a GitHub account?" **Yes** / **No, let's make one**.
- No: run `open https://github.com/signup` (explain: "I'll open the GitHub sign-up page in your browser"), then give
  these steps one message at a time, waiting for "done" after each:
  1. Type your work email and press **Continue**.
  2. Make a password and press **Continue**.
  3. Choose a username. Something like your first name plus `-gq` (for example `vicky-gq`). If it's taken, GitHub
     suggests others; any is fine.
  4. Solve the short puzzle GitHub shows.
  5. GitHub emails you a code. Open that email and type the code into the page.
  6. If GitHub asks about your team or plan, choose the free option or **Skip**.

  Then say: "Your GitHub account is ready."

## 6. Sign in to GitHub on this Mac
- Check: `<mise> exec -- gh auth status` succeeds → skip the sign-in, go to git setup below.
- Explain: "Now I'll connect this Mac to your GitHub account. Your browser opens, and you'll see an 8-character code."
- Act: run `<mise> exec -- gh auth login --web --hostname github.com --git-protocol https --clipboard` in the
  background (`run_in_background`), because it waits until she finishes in the browser. Read its output for the code
  (`XXXX-XXXX`) and the address `https://github.com/login/device`. Run `open https://github.com/login/device`.
- Tell her, showing the code in bold: "Your code is **XXXX-XXXX** (it's already copied). In the browser page, paste
  it, press **Continue**, then the green **Authorize** button. Tell me when the page says you're all set."
- Wait for the background command to finish. Verify: `<mise> exec -- gh auth status` succeeds.
- Git setup (always run; both are safe to repeat):
  - Let git use her GitHub sign-in. Do not run `gh auth setup-git`: it writes the versioned path of the gh install
    (`.../installs/gh/2.x.y/...`) into `~/.gitconfig`, and that path breaks when gh is updated. Use the stable shim path `<shims>` from step 2:
    `git config --global --replace-all credential.https://github.com.helper ''` then
    `git config --global --add credential.https://github.com.helper '!<shims>/gh auth git-credential'`
    (single quotes; write `<shims>` out in full, with `$HOME` for her home folder; the first line clears any older
    helper, so repeating is safe).
  - Identity (D7: GitHub's private email, so her own email stays out of the CRM's history). Set only what is
    missing; a name or email she already has stays as it is. Read
    `<mise> exec -- gh api user --jq '.login, .id, (.name // .login)'`. Then, for each field that
    `git config --global user.name` / `git config --global user.email` prints nothing for:
    `git config --global user.name "<name>"` and
    `git config --global user.email "<id>+<login>@users.noreply.github.com"`.
    Both already set → change nothing and say one line: "Your Mac already knows who you are; keeping it."
  - Explain these as "telling the Mac who you are on GitHub".
- Remember `<login>` and the person's first name (`<first name>`, the first word of the name read above); steps 7 and 13 use them.

## 7. Access to the CRM
- Check: `<mise> exec -- gh api repos/ngtongsheng/gq-projects-crm --jq .permissions.push` prints `true` → skip.
- Look for an invitation:
  `<mise> exec -- gh api user/repository_invitations --jq '.[] | select(.repository.full_name == "ngtongsheng/gq-projects-crm") | .id'`
- Found an id → explain "Tong Sheng invited you to the CRM; I'll accept it", then
  `<mise> exec -- gh api -X PATCH user/repository_invitations/<id>`. Verify with the check above.
- No id → tell her: "Send your GitHub username, **<login>**, to Tong Sheng, and tell me when he replies." Ask
  (AskUserQuestion) "Has Tong Sheng replied?" **Yes, he replied** / **Not yet**. Yes → run this step again from the
  check. Not yet → ask again later; this is waiting, not a failure.

## 8. Download the CRM
- Check: does `~/GQ/gq-projects-crm/.git` exist?
- Absent → explain "Now I'll download the CRM into your GQ folder", then
  `git clone https://github.com/ngtongsheng/gq-projects-crm.git ~/GQ/gq-projects-crm`.
- Present → bring it up to date only when that is safe. Run
  `git -C ~/GQ/gq-projects-crm branch --show-current` and `git -C ~/GQ/gq-projects-crm status --porcelain`.
  On `main` with empty status → explain "getting the latest CRM", then `git -C ~/GQ/gq-projects-crm pull --ff-only`.
  Any other branch or pending changes → leave it as it is (her work in progress is in there) and say "Your CRM is
  already here."
- `~/GQ/gq-projects-crm` exists but has no `.git` → this is a failure; go to
  [When a step fails twice](#when-a-step-fails-twice) straight away.
- Verify: `git -C ~/GQ/gq-projects-crm log -1 --oneline` succeeds.

## 9. Download the GQ helper
- Check: does `~/GQ/gq-setup/.git` exist?
- Absent → explain "Now I'll download GQ's shared Claude settings into your GQ folder", then
  `git clone https://github.com/ngtongsheng/gq-setup.git ~/GQ/gq-setup`.
- Present → bring it up to date only when that is safe, by the same rule as step 8: run
  `git -C ~/GQ/gq-setup branch --show-current` and `git -C ~/GQ/gq-setup status --porcelain`. On `main` with empty
  status → `git -C ~/GQ/gq-setup pull --ff-only`. Any other branch or pending changes → leave it as it is.
- `~/GQ/gq-setup` exists but has no `.git` → this is a failure; go to
  [When a step fails twice](#when-a-step-fails-twice) straight away.
- Verify: `git -C ~/GQ/gq-setup log -1 --oneline` succeeds.

## 10. Install the CRM's tools
- Explain: "Installing what the CRM needs to run. This takes a few minutes."
- Act, in order (each is safe to repeat; no separate check needed):
  1. `<mise> trust ~/GQ/gq-projects-crm/mise.toml`
  2. `cd ~/GQ/gq-projects-crm && <mise> install`
  3. `cd ~/GQ/gq-projects-crm && <mise> exec -- pnpm install`
- Verify: `cd ~/GQ/gq-projects-crm && <mise> exec -- node --version && <mise> exec -- pnpm --version` both succeed.

## 11. Set up Claude for you
- Explain: "Now I'll set Claude up to work the GQ way, on every chat."
- Act: `cd ~/GQ/gq-projects-crm && <mise> exec -- node ~/GQ/gq-setup/agent/apply.mjs` (safe to repeat; it only adds what is missing).
- Verify: the command succeeds, and
  `grep -qxF '@~/GQ/gq-setup/agent/CLAUDE.md' ~/.claude/CLAUDE.md && test -L ~/.claude/output-styles/plain.md`
  succeeds.
- Lines it prints beginning `gq apply:` are warnings. Say one plain line: "Claude is set up; one small thing is
  worth showing Tong Sheng." Keep the warning text for the failure message; show it to her only if she asks.

## 12. Chat tab
Claude's Chat tab does not read the GQ rules from files, so she pastes a short text into her Claude profile once.
- Check: ask (AskUserQuestion) "Did you already paste the GQ text into your Claude profile?" **Yes, already done** /
  **Not yet**. Yes → skip.
- Explain: "The Chat tab needs a short GQ text in your profile. I've copied it; you'll paste it."
- Act: `pbcopy < ~/GQ/gq-setup/agent/chat-profile.md`. Then give these steps together:
  1. In Claude, click your name or initials at the bottom left, then **Settings**.
  2. Choose **Profile** (some versions call it **Your Claude**).
  3. Click the box for your preferences or instructions. If it already has your own text, click below it.
  4. Press **Command + V** to paste, then press **Save** if there is a Save button.
- Verify: ask (AskUserQuestion) "Is the text pasted and saved?" **Yes, it's saved** / **I can't find the box**.
  No box → ask what the Settings window shows and guide her from it; if it still fails, follow
  [When a step fails twice](#when-a-step-fails-twice).

## 13. About you
- Check: `grep -qs '^## About me' ~/.claude/CLAUDE.md`. Succeeds → skip.
- Explain: "Four quick questions so Claude knows how to work with you. You can ask Claude to change your answers any time."
- Act: ask four AskUserQuestion prompts, one after another, recommended option first:
  1. "What should I call you?" **<first name>** / **Something else** (she types it).
  2. "What best describes your role?" **Owner or manager** / **Sales** / **Installation** / **Office and orders**.
  3. "What takes most of your time?" **Customers and quotes** / **Scheduling jobs** / **Orders and stock** /
     **Invoices and paperwork**.
  4. "How much detail do you want from me?" **Short answers** / **A short explanation** / **Full step by step**.
- Then add this block to the end of `~/.claude/CLAUDE.md` (below the import line) with Edit or Write; keep everything
  already in the file, with a blank line before the block:

  ```
  ## About me
  - Call me: <answer 1>
  - My role: <answer 2>
  - Most of my time goes on: <answer 3>
  - Detail I want: <answer 4>
  ```
- Verify: `grep -qs '^## About me' ~/.claude/CLAUDE.md` succeeds. Say: "Done. Ask Claude any time to change this."

## 14. Hand-off
Say, then stop:

"All set! Your computer is ready. Last part, to open the CRM:
1. Quit Claude completely: press **Command + Q**. Then open **Claude** again.
2. Choose the **Code** tab.
3. Press the folder button next to the message box and choose the folder **GQ**, then **gq-projects-crm**.
4. Type: **show me the app**

From then on, that folder is where you work on the CRM. If anything in this setup breaks later, open the **GQ** folder
and paste the setup link again."

The quit and reopen matters: Claude only sees the newly installed tools after a restart.

## When a step fails twice
Stop the setup. Say one plain sentence about which step stopped, for example: "I couldn't finish connecting to GitHub."
Then: "Please take a screenshot of this window and send it to Tong Sheng. Nothing is broken; paste the setup
link again after he replies."
Leave her files and folders exactly as they are, and use only the commands in this file: Tong Sheng fixes anything
beyond them.
