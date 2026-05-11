---
name: setup
description: >-
  Setup-flow trigger. When the user says "configure meigen", "set up image
  generation", "add API key" — or anything matching the setup intent — invoke
  the `/meigen:setup` command (defined in plugin/commands/setup.md). The full
  flow body lives there to keep this skill thin and avoid drift.
version: 0.2.0
disable-model-invocation: true
---

# MeiGen Setup (Skill pointer)

This skill exists for natural-language triggering only. The actual configuration flow lives in the `/meigen:setup` slash command at `plugin/commands/setup.md`.

When this skill fires (user asked to configure but didn't type the slash command), tell the user:

> I can help you configure MeiGen. Running the setup wizard now — you can also type `/meigen:setup` anytime to start it again.

Then **follow the instructions in `plugin/commands/setup.md`** (read that file's body and execute its Step 1 → Step 5 flow). Do not duplicate the body here.
