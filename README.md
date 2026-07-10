# RCBotApplications

A Discord bot for handling staff applications: applicants fill out a modal form,
submissions are posted to a private staff channel for Approve/Deny, and every
decision is archived to a log channel.

## Features

- `/apply` — applicant-facing command that opens a modal with the server's
  configured questions (up to 5, a Discord modal limit).
- `/apply-question add|remove|list|move` — staff manage the question set
  (including reordering) without touching code.
- `/apply-setup review-channel|log-channel|staff-role|view` — staff configure
  where applications are reviewed/archived and who can decide them.
- `/applications <user>` — staff view a user's application history.
- Approve/Deny buttons on each application embed, restricted to the configured
  staff role. Deciding an application DMs the applicant and archives the
  embed to the log channel.
- SQLite storage (`better-sqlite3`) — no external database required.

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN` — your bot's token
   - `DISCORD_CLIENT_ID` — your application's client ID
   - `DISCORD_GUILD_ID` — the server to deploy commands to
3. Register slash commands:
   ```
   npm run deploy-commands
   ```
4. Run the bot:
   ```
   npm run dev
   ```
   or build and run compiled JS:
   ```
   npm run build
   npm start
   ```

## First-time configuration (in Discord)

1. `/apply-setup review-channel #staff-applications`
2. `/apply-setup log-channel #application-log`
3. `/apply-setup staff-role @Staff`
4. `/apply-question add label:"Why do you want to join staff?" style:paragraph required:true`
   (repeat up to 5 questions total)

Applicants can then run `/apply`.

## Required bot permissions/intents

The bot only needs the `Guilds` gateway intent. In the server, it needs
permission to send messages/embeds in the review and log channels, and to DM
users (default, unless the applicant has DMs from server members disabled).

## Deploying to a VPS (24/7)

The SQLite file at `DATABASE_PATH` (default `data/applications.sqlite`) holds
all state, so make sure it lives on a persistent volume/directory in whichever
option you pick below.

### Option A: Docker Compose (recommended)

1. Copy the repo to the server and create `.env` there (same contents as
   `.env.example`, filled in with your real token/IDs). Never commit `.env`.
2. Run the one-time slash command registration from your machine or the
   server (needs the same `.env`):
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
   `.env` in the project root (deploy-commands needs it once too:
   `npm run deploy-commands`).
2. Copy `deploy/rcbotapplications.service` to `/etc/systemd/system/`, editing
   `User` and `WorkingDirectory` to match where you deployed the bot (the
   `discordbot` user should own that directory).
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
question/config edits go through `/apply-setup` and `/apply-question` and
need no redeploy.
