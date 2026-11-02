# Company agent layer

`apply.py` installs and refreshes this folder in `~/.claude`: it pulls gq-setup (clean `main` only), adds the
`@~/GQ/gq-setup/agent/CLAUDE.md` import line, links the `plain` style and the skills, and merges `settings.json`
into her settings (company keys win, her other keys stay). Setup runs it once; the SessionStart hook runs it at the
start of every session, quietly, so pushes to gq-setup reach her Mac with no clicks. Safe to run any number of times.
