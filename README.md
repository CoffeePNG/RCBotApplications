# RCBotApplications — Republicraft Discord Utility Bot

A single config-driven ticket system (applications, bug reports, appeals, help
requests) plus a standard moderation command suite. Built per the Republicraft
build spec: one ticket pipeline, no visible Discord roles for permission
gating, no web dashboard.

## Design summary

- **One ticket system, not several.** Every ticket type (application, bug
  report, appeal, help request, or any new type added later) shares the same
  create → claim → close pipeline in `src/handlers/ticketHandler.ts`. What
  differs between types is a row in the `ticket_configs` table — never a
  separate code path. Adding a new type later is one DB entry, no new code.
- **No roles for ticket visibility.** Who can see/claim/manage a given ticket
  type ("staff") is resolved by Discord user ID against the `ticket_leads`
  table, not by role membership. The public server stays clean — no
  "Head Developer" style roles get created by this bot. Ticket channels use
  per-user permission overwrites (creator + that type's staff + any assigned
  Ticket Managers + added participants + the bot); `@everyone` is denied
  `View Channel`. These overwrites are kept in sync live when staff, managers,
  or participants are added/removed — see `src/utils/ticketPermissions.ts`.
- **Two tiers of access.** *Type staff* (the `ticket_leads` table) manage one
  ticket type. *Ticket Managers* (the `ticket_managers` table) are an explicit,
  bot-assigned global grant that can manage every type. `Manage Server` /
  `Administrator` remain a live override on top of both. All access decisions
  go through one helper, `src/utils/ticketAuth.ts`.
- **Scoped bot permissions.** The bot needs `Manage Channels` (create/delete
  ticket channels), `Kick Members`, `Ban Members`, `Moderate Members` (for
  the moderation suite), and `Send Messages`/`Read Message History`/
  `Attach Files` generally. It does **not** need Administrator, and does not
  request `Manage Roles` — application approval is a status update only, it
  does not auto-assign a role (see "Decisions" below).
- **Built for handoff.** Routine staff management — who's staff for which
  ticket type, who's a Ticket Manager, and an at-a-glance status view — is
  done entirely through slash commands (`/staff`, `/staff-status`). No terminal
  access or JSON/DB editing is needed for that. Adding a brand-new ticket *type*
  (not just adding/removing staff) is a structural change and does require
  a config/code change — see "Adding a new ticket type" below.

## Decisions made during build

These were open questions in the spec, resolved as follows:

| Question | Decision |
|---|---|
| Single- or multi-claim? | Single-claim — one holder at a time. The claimant (or a manager) can **Unclaim** to release it, or eligible staff can **Take Over**; a claimant/manager can also `/ticket assign` it to a specific staff member. Every change is recorded in `claim_history`. |
| Close vs. delete | **Two stages.** *Close* moves the channel to the archive category and removes everyone but staff/managers (kept for review). *Delete* posts the transcript to the archive channel, verifies it, then removes the channel. `/transcript` can dump a transcript any time in between. |
| Transcript delivery | Archive channel only — posted as a `.txt` file (split across files if large) to one shared archive channel (`/ticket-config archive-channel`) or, if none is set, that ticket type's per-type review channel. No DM to the creator. |
| Application approval automation | Status update only — the bot does not assign a role on approval. A human handles onboarding/role assignment separately. `Manage Roles` is intentionally not requested. Closing captures a structured **outcome** (Approved / Denied / No Response / Other) picked from buttons, plus an optional note. |
| Auto-close/auto-unclaim inactive tickets | No background scheduler. Tickets stay open/claimed until explicitly closed. Claims are only auto-released when their holder leaves the server (live, plus a startup reconciliation sweep). |
| Complete set of ticket types? | Application, Bug Report, Appeal, Help Request seeded by default; config schema is generic, so more can be added later without code changes to the pipeline. |
| Lead notification on new ticket | Leads are pinged (individually, by user ID — there's no role to ping) inside the new ticket channel itself, and a short notice is posted to that type's review channel. |

One deviation from the suggested file layout: **Claim and Close are buttons
on the ticket message, not slash commands** (`ticket-claim.ts`/
`ticket-close.ts` in the spec's suggested tree became button handlers inside
`src/handlers/ticketHandler.ts` instead). This matches the described lifecycle
("a lead clicks a Claim button") more directly than a typed command would.

Text-heavy config (open/claim messages, dropdown blurbs, panel title/
description) is edited via **modals**, not slash-command string options —
Discord's slash-command text input is a single-line box with no line breaks,
which is painful for anything longer than a few words. `/ticket-config
open-message type:application`, for example, takes no text argument at all;
it just opens a modal pre-filled with the current message, ready to edit and
resubmit.

## Ticket type config fields

Each row in `ticket_configs` (see `src/db/connect.ts` for the schema) has:
`typeKey`, `displayName`, `department`, `channelPrefix`, `reviewChannelId`,
`openMessage`, `claimMessage`, `optionDescription`. Leads are a separate
`ticket_leads` table (many-to-many by `type_key` + user ID).
`openMessage`/`claimMessage` support `{department}`, `{leads}`, `{creator}`,
`{claimant}` template variables, resolved at send time
(`src/utils/ticketFormatter.ts`). `optionDescription` is the short blurb shown
under a type's label in the ticket panel's dropdown (e.g. "Apply to join the
staff team.") — falls back to `department` if not set.

## Commands

**Tickets**
- `/ticket create type:<autocomplete>` — anyone; opens a modal built from that
  type's configured questions, then creates a private ticket channel. Non-staff
  members are capped at **3 open tickets** at a time (staff/managers are exempt).
- **Ticket panel** — a persistent embed + dropdown (Ticket Tool style) that
  members click instead of typing a slash command; see below.
- **Claim** button — restricted to that type's staff, a Ticket Manager, or a
  `Manage Server` holder. Once claimed the button set becomes **Unclaim** /
  **Take Over**.
- **Close** button — **staff only** (assigned staff, the claimant, a manager, or
  a `Manage Server` holder — *not* the ticket creator). Clicking it shows a row
  of outcome buttons (**Approved / Denied / No Response / Other**);
  picking one pops a small optional-reason note. The channel is then **moved to
  the archive category** but everyone keeps their access, and the buttons become
  **Reopen / Make Staff Only / Delete Channel**.
- **Reopen** button (staff only) — reverts a closed ticket to active, moves the
  channel back to the normal ticket category, and restores the creator's /
  participants' access.
- **Make Staff Only** button (staff only) — removes the creator and participants
  from a closed channel so only staff/managers can see it. (Close no longer does
  this automatically — you choose when to lock it down.)
- **Delete Channel** button (staff only) — a **two-step** delete: it asks for
  confirmation first, then posts the full transcript to the archive channel,
  **verifies** it landed, and only then deletes the channel. A failed archive
  keeps the channel so nothing is lost.
- `/transcript` — post a transcript of the current ticket channel to the archive
  channel at any time (staff/claimant/manager/creator).
- `/ticket unclaim` / `/ticket assign user:<user>` — release or reassign the
  current claim (claimant or a manager; assignees must be staff/manager).
- `/ticket add user:<user>` / `/ticket remove user:<user>` — add/remove an
  extra participant on the current ticket (grants/revokes channel access).

**Admin** (require `Manage Server`)
- `/staff add|remove type:<autocomplete> user:<user>` — manage a ticket type's
  staff. Takes effect immediately and syncs channel access on open tickets.
- `/staff list [type]` — list staff for a type (or all types).
- `/staff manager-add|manager-remove|manager-list user:<user>` — manage global
  Ticket Managers (can manage every ticket type).
- `/staff-status` — embed showing Ticket Managers, the shared archive channel,
  and every ticket type with its staff, review channel, and live counts.
- `/ticket-config review-channel type:<autocomplete> channel:<channel>` —
  (re)point a ticket type's per-type review/archive channel.
- `/ticket-config archive-channel channel:<channel>` — set one shared archive
  channel used for **all** types' closed-ticket transcripts (falls back to the
  per-type review channel when unset).
- `/ticket-config archive-category category:<category>` — set the category that
  closed ticket channels are moved to (staff-only) before deletion.
- `/ticket-config questions type:<autocomplete>` — manage the 1–5 questions
  asked when a ticket of that type is opened (add/edit/remove/reorder/reset).
- `/ticket-config category category:<category>` — set the category new ticket
  channels open under (applies to every type).
- `/ticket-config enabled type:<autocomplete> open:<bool>` — open or close a
  ticket type (closed types can't be opened and hide from the panel).
- `/ticket-config open-message type:<autocomplete>` /
  `claim-message type:<autocomplete>` / `option-description type:<autocomplete>`
  — each opens a modal pre-filled with the current text so you can edit it as
  proper multi-line text instead of a cramped single-line command option.
  Saves take effect immediately, no restart. `option-description` is the
  blurb shown under that type in the panel's dropdown.
- `/ticket-panel post channel:<channel>` — post the ticket creation panel
  (embed + select menu, one option per configured ticket type, each showing
  its `option-description` as the dropdown's sub-text) in a channel.
  Re-running it (even in a different channel) edits the existing panel
  message in place rather than leaving duplicates behind — the panel's
  channel/message ID is tracked in `guild_settings`. Run this again any time
  ticket types change, so the dropdown reflects the current list.
- `/ticket-panel customize` — opens a modal pre-filled with the panel's
  current title/description (use `{types}` in the description to insert the
  type list). Leaving a field blank resets it to the default. If a panel is
  already posted, it's refreshed live immediately.
- `/mod-config log-channel channel:<channel>` — set the moderation log
  channel.

**Moderation**
- `/ban user reason? delete_message_days?` — requires `Ban Members`.
- `/kick user reason?` — requires `Kick Members`.
- `/timeout user minutes reason?` — requires `Moderate Members`.
- `/warn user reason` — requires `Moderate Members`; persisted in SQLite.
- `/unwarn warning_id` — clears (soft-deletes) a warning.
- `/warnings user` — lists a user's active warnings.

All moderation actions that succeed are logged as an embed to the channel set
via `/mod-config log-channel`, if configured.

## Ticket archive logs

Closing a ticket is a two-stage process. **Close** moves the channel into the
archive category (`/ticket-config archive-category`) but keeps everyone's access;
staff can then use **Make Staff Only** to hide it from non-staff, **Reopen** it,
or **Delete Channel**. **Delete Channel** (or `/transcript` at any time) posts to
the resolved archive channel (the shared
`/ticket-config archive-channel`, or the type's per-type review channel): one
summary embed — titled `<Ticket Type> — <code>`, with Opened/Claimed/Closed-by,
**outcome**, optional **reason**, duration, and a per-person message count (not
the message bodies) — plus the full transcript as a `.txt` file (or several,
split on line boundaries if it would exceed Discord's upload limit), never a
code block. Each message line carries author tag + id, message id, reply
references, edit timestamps, pins, attachment names/urls, embed counts, and
system events. The channel is only deleted **after** the archive post is
confirmed, so a transcript is never lost to a failed delete — a failure keeps
the channel so you can Delete again.

## Ticket channel names

Channels are named `<prefix>-<username>-<5 digits>` (e.g. `application-coffee-04217`),
using a uniqueness-checked random 5-digit suffix. That full code is shown in the
embed footer and used as the archive `.txt` filename, so a channel name and its
eventual archive entry are always easy to match up.

## Adding a new ticket type

Not a routine change — add an entry to `src/seed/defaultTicketTypes.ts` (or
insert directly into the `ticket_configs` table), then run
`/ticket-config questions`, `/ticket-config review-channel`, and `/staff add`
to finish wiring it up in Discord. No changes to `ticketHandler.ts` or any
command are needed.

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`,
   `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`.
3. Register slash commands:
   ```
   npm run deploy-commands
   ```
4. Run the bot:
   ```
   npm run dev
   ```
   or build and run compiled JS: `npm run build && npm start`.

On first connect, the bot seeds the four default ticket types into SQLite for
the configured guild (if they don't already exist). Then, in Discord:

1. `/ticket-config archive-channel channel:#ticket-archive` (one shared archive
   for all types), or `/ticket-config review-channel type:application
   channel:#staff-applications` per type.
2. `/ticket-config archive-category category:#Archived` — where closed ticket
   channels park (staff-only) before deletion.
3. `/staff add type:application user:@SomeStaff` (repeat per type/staff), and
   optionally `/staff manager-add user:@SomeManager` for a global manager.
4. `/mod-config log-channel channel:#mod-log`
4. `/ticket-panel post channel:#create-a-ticket` (optional — gives members a
   dropdown instead of needing to know the slash command)

Members can then run `/ticket create` or use the panel.

## Required bot permissions/intents

Gateway intents: `Guilds`, `GuildMessages`, plus two **privileged** intents —
`MessageContent` (to read message text for transcripts) and `GuildMembers` (to
release a staff member's claims when they leave the server). Both privileged
intents must also be enabled in the Discord Developer Portal (Bot → Privileged
Gateway Intents) or the bot fails to log in. Server permissions:
`Manage Channels`, `Kick Members`, `Ban Members`, `Moderate Members`, plus the
ability to send messages/embeds/files and read message history in whatever
channels get used as review/archive/mod-log channels. No Administrator, no
Manage Roles.

## Deploying to a VPS (24/7)

The SQLite file at `DATABASE_PATH` (default `data/rcbot.sqlite`) holds all
state — ticket types, leads, tickets, warnings — so make sure it lives on a
persistent volume/directory in whichever option you pick below.

### Option A: Docker Compose (recommended)

1. Copy the repo to the server and create `.env` there. Never commit `.env`.
2. Register slash commands once (needs the same `.env`):
   ```
   npm install
   npm run deploy-commands
   ```
3. Build and start the bot as a background service:
   ```
   docker compose up -d --build
   ```
4. `data/` is bind-mounted next to `docker-compose.yml`, so the SQLite file
   survives container rebuilds/restarts. Check logs with
   `docker compose logs -f`.

### Option B: systemd (no Docker)

1. On the server: `git clone`, then `npm ci`, `npm run build`, and create
   `.env` in the project root (`npm run deploy-commands` needs it once too).
2. Copy `deploy/rcbotapplications.service` to `/etc/systemd/system/`, editing
   `User` and `WorkingDirectory` to match where you deployed the bot.
3. Enable and start it:
   ```
   sudo systemctl daemon-reload
   sudo systemctl enable --now rcbotapplications
   sudo systemctl status rcbotapplications
   journalctl -u rcbotapplications -f
   ```
4. To deploy an update: `git pull && npm ci && npm run build && sudo systemctl restart rcbotapplications`.

Whichever option you use, re-run `npm run deploy-commands` only when the
slash command *definitions* change (new options, new commands) — day-to-day
staff/config edits go through `/staff`, `/ticket-config`, and `/mod-config`
and need no redeploy.
