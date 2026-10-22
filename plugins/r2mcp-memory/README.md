# r2mcp-memory

A Claude Code mod: your r2mcp long-term memory, in a pane beside the chat.

- **Related.** As you send a prompt, the pane recalls the memories that match it and lists them with
  their match scores. This runs in the background: your prompt is never held up, and nothing is added
  to the model's context.
- **What to remember.** When a turn ends, a cheap gate asks whether anything durable happened. Only
  on a yes does a fork of the session pick out at most two memories. Each is checked against the
  nearest existing memory and planned as an ADD, an UPDATE of that memory, or a NOOP when it is
  already known. Health details and anything that looks like a secret are never proposed.
- **A mode switch on the pane:** `off`, `shadow` (shown, never written), `propose` (Save/Skip on
  each, the default) and `auto` (written as found). The choice is saved like a `/config` setting.
- **A reader.** Every memory and proposal opens in full with its `read` button (or keys `1`–`9` and
  `a`–`h` while the pane is focused). The reader has three views: **Readable** lays the memory out
  by rule (who and when, labelled sections such as *Why*, numbered lists, short paragraphs) without
  changing a word; **Original** shows it as stored; **Summarize** asks a small model (Haiku by
  default) for a plain-English version, labelled as an AI summary and kept for the session.

`/r2mcp-memory` opens the pane (`clear` empties it). `/r2mcp-memory-stats` summarizes the remember
log: gate yes-rate, fork time and cache reads, operations, and your Save/Skip and judgments;
`export` writes it to `local/r2mcp-memory/log.json`. The log never holds prompt or answer text.

## Install

At a Claude Code prompt in a terminal:

    /plugin install r2mcp-memory --marketplace DMokong/r2mcp

Answer `y` to add the marketplace, then pick a scope. Installed at user scope it loads in every
session, the desktop app's local Code sessions included, where the same pane draws natively.

## Needs

- Claude Code with mod support (early access; tested on 2.1.308).
- This repo's server connected as the MCP server named `memory` (its `recall` and `remember` tools).
  Without it the pane stays empty and nothing is proposed. Recall and remember go through your
  permission rules like any tool call.

## Options (`/config`)

| Option | Default | |
|---|---|---|
| Remember mode | `propose` | `off`, `shadow`, `propose`, `auto`; also on the pane |
| Related: turns kept | 3 | how many recent prompts the Related list covers |
| Forks per session | 6 | the most forks in one session; each re-reads the session's prefix from the prompt cache |
| Summary model | `haiku` | the model behind the reader's Summarize |
| Scheduled-job prompts folder | `tasks/prompts` | a session whose first prompt starts with a `# heading` from this folder's `.md` files is never weighed; empty for none |
| Gate model | (empty) | empty uses the engine's small fast model |

## Turning it off

- Remember mode `off` on the pane or in `/config` stops the end-of-turn work; Related keeps showing.
- `R2MCP_MODS=0` in the environment turns it off for that process (`DMOKONG_MODS=0` also does).
- `claude plugin disable r2mcp-memory@r2mcp`.

Headless runs (`claude -p`) are always ignored, and so are sessions whose first prompt is a
scheduled job's prompt file (see the option above).

## Working on it

The mod is checked by Claude Code's own tools, not by this repo's `npm test`, `npm run lint` or
Prettier, which leave `plugins/` alone:

    claude plugin validate plugins/r2mcp-memory
    claude plugin test plugins/r2mcp-memory
    claude --plugin-dir plugins/r2mcp-memory

If the plugin is also installed, `--plugin-dir` overrides the installed copy for that session.

## Releasing

Bump `version` in `plugins/r2mcp-memory/.claude-plugin/plugin.json` and in this repo's
`.claude-plugin/marketplace.json` together, add a CHANGELOG entry, push, then
`claude plugin marketplace update r2mcp` and `claude plugin update r2mcp-memory@r2mcp`. Sessions
already running keep the version they started with until restarted.
