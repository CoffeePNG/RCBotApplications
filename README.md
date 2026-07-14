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
  type ("leads") is resolved by Discord user ID against the `ticket_leads`
  table, not by role membership. The public server stays clean — no
  "Head Developer" style roles get created by this bot. Ticket channels use
  per-user permission overwrites (creator + that type's leads + the bot);
  `@everyone` is denied `View Channel`.
- **Scoped bot permissions.** The bot needs `Manage Channels` (create/delete
  ticket channels), `Kick Members`, `Ban Members`, `Moderate Members` (for
  the moderation suite), and `Send Messages`/`Read Message History`/
  `Attach Files` generally. It does **not** need Administrator, and does not
  request `Manage Roles` — application approval is a status update only, it
  does not auto-assign a role (see "Decisions" below).
- **Built for handoff.** Routine staff management — who's a lead for which
  ticket type, and an at-a-glance status view — is done entirely through
  slash commands (`/staff-assign`, `/staff-status`). No terminal access or
  JSON/DB editing is needed for that. Adding a brand-new ticket *type*
  (not just adding/removing a lead) is a structural change and does require
  a config/code change — see "Adding a new ticket type" below.

## Decisions made during build

These were open questions in the spec, resolved as follows:

| Question | Decision |
|---|---|
| Single- or multi-claim? | Single-claim — the Claim button disables once someone claims, until the ticket closes. |
| Transcript delivery | Archive channel only — posted as a `.txt` file to that ticket type's configured review/archive channel. No DM to the creator. |
| Application approval automation | Status update only — the bot does not assign a role on approval. A human handles onboarding/role assignment separately. `Manage Roles` is intentionally not requested. |
| Auto-close/auto-unclaim inactive tickets | Not implemented — tickets stay open/claimed until a lead or the creator explicitly closes them. No background scheduler. |
| Complete set of ticket types? | Application, Bug Report, Appeal, Help Request seeded by default; config schema is generic, so more can be added later without code changes to the pipeline. |
| Lead notification on new ticket | Leads are pinged (individually, by user ID — there's no role to ping) inside the new ticket channel itself, and a short notice is posted to that type's review channel. |

One deviation from the suggested file layout: **Claim and Close are buttons
on the ticket message, not slash commands** (`ticket-claim.ts`/
`ticket-close.ts` in the spec's suggested tree became button handlers inside
`src/handlers/ticketHandler.ts` instead). This matches the described lifecycle
("a lead clicks a Claim button") more directly than a typed command would.

## Ticket type config fields

Each row in `ticket_configs` (see `src/db/connect.ts` for the schema) has:
`typeKey`, `displayName`, `department`, `channelPrefix`, `reviewChannelId`,
`openMessage`, `claimMessage`. Leads are a separate `ticket_leads` table
(many-to-many by `type_key` + user ID). `openMessage`/`claimMessage` support
`{department}`, `{leads}`, `{creator}`, `{claimant}` template variables,
resolved at send time (`src/utils/ticketFormatter.ts`).

## Commands

**Tickets**
- `/ticket create type:<autocomplete>` — anyone; opens a modal for ticket
  details, then creates a private ticket channel.
- **Claim** / **Close** buttons on the ticket's message — Claim is restricted
  to that type's configured leads (or anyone with `Manage Server`); Close is
  restricted to a lead, the claimant, `Manage Server` holders, or the ticket's
  creator.

**Admin** (require `Manage Server`)
- `/staff-assign type:<autocomplete> action:<add|remove> user:<user>` —
  manage leads for a ticket type. Takes effect immediately, no restart.
- `/staff-status` — embed showing every ticket type, its leads, its review
  channel, and live open/claimed/closed counts.
- `/ticket-config review-channel type:<autocomplete> channel:<channel>` —
  (re)point a ticket type's review/archive channel.
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

## Adding a new ticket type

Not a routine change — add an entry to `src/seed/defaultTicketTypes.ts` (or
insert directly into the `ticket_configs` table) with the six fields above,
then run `/ticket-config review-channel` and `/staff-assign` to finish wiring
it up in Discord. No changes to `ticketHandler.ts` or any command are needed.

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

1. `/ticket-config review-channel type:application channel:#staff-applications`
   (repeat per type)
2. `/staff-assign type:application action:add user:@SomeLead` (repeat per
   type/lead)
3. `/mod-config log-channel channel:#mod-log`

Members can then run `/ticket create`.

## Required bot permissions/intents

Gateway intent: `Guilds` only. Server permissions: `Manage Channels`,
`Kick Members`, `Ban Members`, `Moderate Members`, plus the ability to send
messages/embeds/files and read message history in whatever channels get used
as review/archive/mod-log channels. No Administrator, no Manage Roles.

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
lead/config edits go through `/staff-assign`, `/ticket-config`, and
`/mod-config` and need no redeploy.
