# RCBotApplications — Project Recap

A Discord utility bot for **Republicraft**: a single config-driven **ticket
system** (staff applications, bug reports, appeals, help requests) plus a
standard **moderation** command suite. Built on discord.js v14 + TypeScript,
storing everything in a local SQLite file.

---

## Core design

- **One ticket system, not several.** Every ticket type shares the same
  create → claim → close pipeline. What differs between types is data in the
  database, not separate code paths — adding a new type later is a config
  entry, not new code.
- **No Discord roles for ticket visibility.** Who can see/claim/manage a
  ticket type ("leads") is resolved by Discord **user ID** against a database
  table, not by role membership. Keeps the public server free of staff-only
  roles. Ticket channels use per-user permission overwrites (creator + that
  type's leads + the bot); `@everyone` is denied View Channel.
- **Scoped bot permissions.** Needs Manage Channels, Kick/Ban Members,
  Moderate Members — **not** Administrator, and not Manage Roles.
- **Built for handoff.** Day-to-day management (leads, channels, messages,
  panel, open/closed state) is all done through Discord slash commands and
  modals — no terminal access or file editing needed.

---

## Ticket lifecycle

1. **Create** — a member runs `/ticket create` (or clicks the panel dropdown),
   fills out a modal, and the bot creates a private channel with the right
   permission overwrites, posts a summary embed with Claim/Close buttons, and
   pings the type's leads.
2. **Claim** — a lead clicks **Claim** (single-claim: locks to one person).
   The button disables, and the ticket creator gets pinged.
3. **Close** — a lead or the creator clicks **Close** → an ephemeral
   **Confirm/Cancel** prompt appears (so a misclick can't nuke a ticket) →
   on confirm, a public "closed by X, deleting in 5s" notice is posted, the
   transcript is archived, and the channel is deleted.

### Ticket codes

Each ticket gets a unique human-readable code of the form
`prefix-username-#####` (e.g. `application-coffee-04297`), where the ending is
a random 5-digit number, uniqueness-checked. It's used as the **channel name**
and shown in the embed footer, archive summary, review notice, and transcript
filename. Numeric IDs still run the internals (buttons/lookups).

### Ticket archive (on close)

Posted to the type's review/archive channel:
1. A **summary embed** — ticket code, opened/claimed/closed by, duration, and a
   **per-person message count** (not the transcript text).
2. Below it, the **transcript** as a code block plus a full `.txt` attachment.

Transcripts capture what users actually typed (requires the **Message Content**
privileged intent, enabled in code and in the Developer Portal).

---

## Ticket types

Four seeded by default, all **enabled** on first run:

| Type | Key | Department | Channel prefix |
|---|---|---|---|
| Staff Application | `application` | leadership | `application` |
| Bug Report | `bug_report` | development | `bug` |
| Appeal | `appeal` | moderation | `appeal` |
| Help Request | `help_request` | support | `help` |

Each type has: display name, department, channel prefix, review channel,
leads, open/claim message templates, dropdown blurb, and an open/closed flag.

---

## Commands

### Tickets
- `/ticket create type:<autocomplete>` — anyone; opens the details modal.
- **Ticket panel** — a persistent embed + dropdown (Ticket Tool style) that
  members click instead of typing the command. Only shows **open** types.
- **Claim / Close buttons** on the ticket message (with the confirm-close step).

### Admin (require Manage Server)
- `/staff-assign type:<> action:<add|remove> user:<>` — manage a type's leads
  live, no restart.
- `/staff-status` — embed of every type: leads, live open/claimed/closed
  counts, review channel, and 🟢 open / 🔴 closed state.
- `/ticket-config review-channel type:<> channel:<>` — set a type's
  review/archive channel.
- `/ticket-config open-message | claim-message | option-description type:<>` —
  each opens a **modal** pre-filled with the current text to edit (multi-line
  friendly). Dropdown blurb = the sub-text shown under a type in the panel.
- `/ticket-config category category:<>` — one Discord category all new ticket
  channels open under (guild-wide; falls back to none if deleted).
- `/ticket-config enabled type:<> open:<true|false>` — **open or close a ticket
  type.** Closed types are hidden from the panel + autocomplete and rejected at
  every open path.
- `/ticket-panel post channel:<>` — post/refresh the panel (edits in place on
  re-run).
- `/ticket-panel customize` — modal to edit the panel's title/description
  (blank resets to default; live-refreshes a posted panel).
- `/mod-config log-channel channel:<>` — set the moderation log channel.

### Moderation (gated by real Discord permission bits)
- `/ban user reason? delete_message_days?` — requires Ban Members.
- `/kick user reason?` — requires Kick Members.
- `/timeout user minutes reason?` — requires Moderate Members.
- `/warn user reason` — persisted in SQLite; requires Moderate Members.
- `/unwarn warning_id` — clears (soft-deletes) a warning.
- `/warnings user` — lists a user's active warnings.

Successful mod actions are logged as an embed to the mod-log channel if set.

---

## Decisions made along the way

| Question | Decision |
|---|---|
| Single- or multi-claim? | Single-claim. |
| Transcript delivery | Archive channel only (embed + code block + `.txt`). |
| Application approval automation | Status update only — no auto role assignment. |
| Auto-close inactive tickets | Not implemented — manual close only. |
| Lead notification on new ticket | Leads pinged in the channel + notice in review channel. |
| Text-heavy config editing | Via modals, not cramped slash-command options. |
| No web dashboard | Everything is Discord-native per the spec. |

---

## Tech / hosting notes

- **Stack:** discord.js v14, Node.js, TypeScript, better-sqlite3 (v12, for
  Node 24 prebuilt binaries — avoids compiling from source).
- **Database:** single SQLite file (`data/rcbot.sqlite`). Schema self-migrates
  on startup via `ensureColumn` — no manual migrations needed.
- **Source of truth:** GitHub `CoffeePNG/RCBotApplications` (branch `main`),
  mirrored to a Forgejo repo that Pterodactyl pulls from.
- **Hosting:** Pterodactyl panel. Deploy loop = push to the repo → **Restart**
  (Automatic Git Update pulls, installs, and rebuilds automatically).
- **After adding/changing slash commands:** run the one-time `deploy-commands`
  step to register them with Discord (temporarily point the start command at
  `dist/deploy-commands.js`, restart, then switch back).
- **Required privileged intent:** Message Content (Developer Portal → Bot →
  Privileged Gateway Intents) — needed for transcript capture; the bot won't
  start without it since it requests the intent.

---

## First-time setup checklist (in Discord)

1. `/ticket-config review-channel type:<each> channel:<#...>`
2. `/staff-assign type:<each> action:add user:<@lead>` (per lead)
3. `/ticket-config category category:<pick a category>`
4. `/mod-config log-channel channel:<#mod-log>`
5. `/ticket-config enabled type:<> open:false` for any types not ready yet
6. `/ticket-panel post channel:<#create-a-ticket>`

Members can then use `/ticket create` or the panel.

---

## Out of scope (per the build spec)

- Minecraft server bridge (RCON, whitelist sync, status) — separate future phase.
- Economy / leveling / music / third-party social integrations.
- Web-based dashboard or admin panel.
