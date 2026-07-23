# RCBotApplications — Project Recap

A Discord utility bot for **Republicraft**: a single config-driven **ticket
system** (staff applications, bug reports, appeals, help requests). Built on
discord.js v14 + TypeScript, storing everything in a local SQLite file.

---

## Core design

- **One ticket system, not several.** Every ticket type shares the same
  create → claim → close pipeline. What differs between types is data in the
  database, not separate code paths — adding a new type later is a config
  entry, not new code.
- **No Discord roles for ticket visibility.** Access is resolved by Discord
  **user ID** against database tables, not role membership. Two tiers: *type
  staff* (`ticket_leads`, per type) and global *Ticket Managers*
  (`ticket_managers`, all types), with `Manage Server`/`Administrator` a live
  override on top. All checks funnel through one helper (`utils/ticketAuth.ts`).
  Ticket channels use per-user overwrites (creator + staff + managers + added
  participants + the bot); `@everyone` is denied View Channel, and overwrites
  are kept in sync live as people are added/removed.
- **Scoped bot permissions.** Needs Manage Channels — **not** Administrator,
  and not Manage Roles.
- **Built for handoff.** Day-to-day management (staff, managers, questions,
  channels, messages, panel, open/closed state) is all done through Discord
  slash commands and modals — no terminal access or file editing needed.

---

## Ticket lifecycle

1. **Create** — a member runs `/ticket create` (or clicks the panel dropdown),
   fills out a modal built from that type's configured questions, and the bot
   creates a private channel with the right permission overwrites, posts a
   summary embed with Claim/Close buttons, and pings the type's staff. Non-staff
   members are capped at **3 open tickets** at once (staff/managers exempt),
   enforced at every open path.
2. **Claim** — staff or a manager clicks **Claim** (single-claim: locks to one
   person). The button set becomes **Unclaim** / **Take Over**, and the creator
   gets pinged. The claimant/manager can also `/ticket unclaim` or
   `/ticket assign @user`; every ownership change is logged in `claim_history`.
   Extra people can be pulled in with `/ticket add @user`.
3. **Close** — **staff only** (assigned staff, the claimant, or a manager; not
   the creator) clicks **Close** → a row of **outcome buttons** (Approved /
   Denied / No Response / Other) → picking one pops a small
   optional-reason note. The channel is **moved to the archive category** but
   everyone keeps access. The buttons become **Reopen / Make Staff Only /
   Delete Channel**.
4. **Reopen / Make Staff Only / Delete** — all staff only. *Reopen* reverts to
   active, moves the channel back to the ticket category, and restores
   creator/participant access. *Make Staff Only* removes the creator/participants
   so only the team can see it (close no longer does this automatically).
   *Delete* is **two-step**: confirm → post the transcript to the archive channel
   and **verify** it landed → then remove the channel (a failed archive keeps
   the channel). `/transcript` can dump a transcript any time in between.

### Ticket codes

Each ticket gets a unique human-readable code of the form
`prefix-username-#####` (e.g. `application-coffee-04297`), where the ending is
a random 5-digit number, uniqueness-checked. It's used as the **channel name**
and shown in the embed footer, archive summary, review notice, and transcript
filename. Numeric IDs still run the internals (buttons/lookups).

### Ticket archive (on delete / `/transcript`)

Posted to the resolved archive channel — one shared channel
(`/ticket-config archive-channel`) if set, else the type's per-type review
channel:
1. A **summary embed** — ticket code, opened/claimed/closed by, **outcome**,
   optional **reason**, duration, and a **per-person message count**.
2. The full **transcript** as a `.txt` attachment (split across files if it
   exceeds Discord's upload limit), never a code block. It opens with a metadata
   header (guild, ticket number, topic, created/closed on + by, close reason,
   claimant, participant list, pinned messages), then the original
   **questions/answers**, then a numbered message log — each line
   `<n> [DD/MM/YYYY, HH:MM:SS UTC] Name: text` with reply refs, edit markers,
   attachments, embed counts, and system events preserved.

Closed channels are first parked in the **archive category**
(`/ticket-config archive-category`), staff-only, until deleted. Transcripts
capture what users actually typed (requires the **Message Content** privileged
intent, enabled in code and in the Developer Portal).

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
staff, open/claim message templates, dropdown blurb, an open/closed flag, and
its own set of **1–5 configurable questions** (label, placeholder, short/
paragraph, required, order) asked in the create modal. Answers are **snapshotted**
onto each ticket, so editing a type's questions never rewrites old tickets.

---

## Commands

### Tickets
- `/ticket create type:<autocomplete>` — anyone; opens the questions modal.
- **Ticket panel** — a persistent embed + dropdown (Ticket Tool style) that
  members click instead of typing the command. Only shows **open** types.
- **Claim / Unclaim / Take Over / Close / Delete buttons** on the ticket message
  (Close is staff-only → outcome buttons + optional note → archives + shows Delete).
- `/transcript` — post a transcript of the current channel to the archive channel.
- `/ticket unclaim` · `/ticket assign user:<>` — release/reassign the claim.
- `/ticket add user:<>` · `/ticket remove user:<>` — manage extra participants.

### Admin (require Manage Server)
- `/staff add|remove type:<> user:<>` — manage a type's staff live (syncs
  channel access on open tickets), `/staff list [type]` to view.
- `/staff manager-add|manager-remove|manager-list user:<>` — global Ticket
  Managers (can manage every type).
- `/staff-status` — embed of Ticket Managers, the shared archive channel, and
  every type: staff, live counts, review channel, and 🟢/🔴 state.
- `/ticket-config review-channel type:<> channel:<>` — set a type's per-type
  review/archive channel.
- `/ticket-config archive-channel channel:<>` — one shared archive channel for
  all types' transcripts (falls back to per-type review channel when unset).
- `/ticket-config archive-category category:<>` — category that closed ticket
  channels are moved to (staff-only) before deletion.
- `/ticket-config questions type:<>` — add/edit/remove/reorder/reset a type's
  1–5 create questions (panel of buttons + modals).
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
- `/ticket-config log-channel channel:<>` — set the channel ticket lifecycle
  events are logged to.

### Ticket logging

Ticket lifecycle events — **close** (with outcome + note), **reopen**, and
**channel delete** — are logged as an embed to the channel set via
`/ticket-config log-channel`. Because the log lives in its own channel, the
closing feedback survives even after the ticket channel itself is deleted.

---

## Decisions made along the way

| Question | Decision |
|---|---|
| Single- or multi-claim? | Single-claim, with unclaim / take over / assign. |
| Close vs. delete | Two stages: Close archives the channel (staff-only) → Delete posts the transcript + removes it. `/transcript` works any time. |
| Transcript delivery | Archive channel only (summary embed + `.txt` file(s), no code block). |
| Application approval automation | Status update only — no auto role assignment; close records a structured outcome. |
| Auto-close inactive tickets | Not implemented — manual close only. Claims auto-release only when the holder leaves the server. |
| Staff notification on new ticket | Staff pinged in the channel + notice in review channel. |
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
- **Required privileged intents:** Message Content (transcript capture) and
  Server Members / GuildMembers (release a staff member's claims when they leave)
  — both must be enabled in the Developer Portal → Bot → Privileged Gateway
  Intents; the bot won't start without them since it requests both.

---

## First-time setup checklist (in Discord)

1. `/ticket-config archive-channel channel:<#ticket-archive>` (or per-type
   `/ticket-config review-channel type:<each> channel:<#...>`)
2. `/ticket-config archive-category category:<Archived>` (where closed channels park)
3. `/staff add type:<each> user:<@staff>` (per staff); optionally
   `/staff manager-add user:<@manager>` for a global manager
4. `/ticket-config questions type:<each>` — review/adjust the seeded questions
5. `/ticket-config category category:<pick a category>`
6. `/ticket-config log-channel channel:<#ticket-log>` (optional)
7. `/ticket-config enabled type:<> open:false` for any types not ready yet
8. `/ticket-panel post channel:<#create-a-ticket>`

Members can then use `/ticket create` or the panel.

---

## Out of scope (per the build spec)

- Minecraft server bridge (RCON, whitelist sync, status) — separate future phase.
- Economy / leveling / music / third-party social integrations.
- Web-based dashboard or admin panel.
