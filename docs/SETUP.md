# Complete Setup Guide

This guide walks you through setting up the Charger Robotics 3786 Slack Bot from scratch. Each step has clear prerequisites and outputs that feed into subsequent steps.

---

## 🧪 POC Mode vs Production Mode

This bot supports two deployment modes:

| Mode | Use Case | Account Strategy |
|------|----------|------------------|
| **🧪 POC Mode** | Testing if the team wants this | Personal accounts (your own Cloudflare, etc.) |
| **🏭 Production Mode** | Team has validated and adopted | Team-owned accounts (see [Succession Planning](succession-planning.md)) |

### POC Mode (Recommended for First-Time Setup)

If you're just exploring whether the team would even use this bot:

1. **Use your personal accounts** - Cloudflare, Atlassian Developer, etc.
2. **Keep costs at $0** - Stay within free tiers
3. **Easy to discard** - If team doesn't want it, just delete the Worker
4. **Easy to migrate later** - If team adopts it, transfer to team accounts

> 💡 **Tip**: Start in POC Mode. The succession planning docs describe how to migrate to team ownership *after* you've validated the concept.

### When to Switch to Production Mode

Migrate to team-owned accounts when:
- ✅ Team has tested and wants to keep the bot
- ✅ Multiple people need admin access
- ✅ Bot becomes "critical infrastructure"

See [Succession Planning](succession-planning.md) for the migration checklist.

---

## 📋 Setup Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SETUP DEPENDENCY CHAIN                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Step 1] Prerequisites                                                      │
│      │                                                                       │
│      ├──→ Node.js 18+                                                        │
│      ├──→ npm                                                                │
│      └──→ Git                                                                │
│           │                                                                  │
│           ▼                                                                  │
│  [Step 2] Cloudflare Account ──────────────────┐                             │
│      │                                          │                            │
│      │ OUTPUT: Cloudflare account               │                            │
│      │                                          │                            │
│      ▼                                          ▼                            │
│  [Step 3] Create Slack App              [Step 4] Create Atlassian App        │
│      │                                          │                            │
│      │ OUTPUT:                                  │ OUTPUT:                    │
│      │  • Signing Secret ─────────┐             │  • Client ID ────────┐     │
│      │  • Bot Token ──────────────┤             │  • Client Secret ────┤     │
│      │  • App ID                  │             │                      │     │
│      │                            │             │                      │     │
│      ▼                            │             ▼                      │     │
│  [Step 5] GitLab Token            │         (same as step 4)           │     │
│      │                            │                                    │     │
│      │ OUTPUT:                    │                                    │     │
│      │  • Access Token ───────────┤                                    │     │
│      │                            │                                    │     │
│      ▼                            ▼                                    │     │
│  [Step 6] Cloudflare Resources ◄──────────────────────────────────────┘     │
│      │                                                                       │
│      │ OUTPUT:                                                               │
│      │  • KV Namespace ID                                                    │
│      │  • D1 Database ID                                                     │
│      │  • Queue name                                                         │
│      │                                                                       │
│      ▼                                                                       │
│  [Step 7] Configure wrangler.toml ◄── KV ID, D1 ID                           │
│      │                                                                       │
│      ▼                                                                       │
│  [Step 8] Set Secrets ◄── All tokens from Steps 3-5                          │
│      │                                                                       │
│      ▼                                                                       │
│  [Step 9] Database Migration                                                 │
│      │                                                                       │
│      ▼                                                                       │
│  [Step 10] Deploy & Configure Slack URLs ◄── Worker URL                      │
│      │                                                                       │
│      ▼                                                                       │
│  [Step 11] Test & Verify                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ⏱️ Time Estimates

| Step | Time | Complexity |
|------|------|------------|
| 1. Prerequisites | 5-10 min | Easy |
| 2. Cloudflare Account | 5 min | Easy |
| 3. Create Slack App | 15 min | Medium |
| 4. Create Atlassian App | 15 min | Medium |
| 5. GitLab Token | 5 min | Easy |
| 6. Cloudflare Resources | 5 min | Easy (automated) |
| 7. Configure wrangler.toml | 5 min | Easy |
| 8. Set Secrets | 5 min | Easy (automated) |
| 9. Database Migration | 2 min | Easy (automated) |
| 10. Deploy & URLs | 10 min | Medium |
| 11. Test & Verify | 10 min | Medium |
| **Total** | **~75 min** | |

---

## Step 1: Prerequisites

### Required Software

| Software | Version | Check Command | Install Link |
|----------|---------|---------------|--------------|
| Node.js | ≥ 18.0 | `node --version` | [nodejs.org](https://nodejs.org/) |
| npm | ≥ 9.0 | `npm --version` | (comes with Node.js) |
| Git | any | `git --version` | [git-scm.com](https://git-scm.com/) |

### Verify Installation

```bash
# Clone the repository (if not already done)
git clone https://github.com/ChargerRobotics/slack-bot.git
cd slack-bot

# Install dependencies
npm install

# Run setup checker
npm run setup:check
```

**Expected output**: All checks pass (or show what needs to be done)

### 📤 Output from this step:
- ✅ Development environment ready
- ✅ Project dependencies installed

---

## Step 2: Cloudflare Account

### 2.1 Create Account

1. Go to: **https://dash.cloudflare.com/sign-up**
2. Sign up with your email:
   - **🧪 POC Mode**: Your personal email is fine (easy to test & discard)
   - **🏭 Production Mode**: Use team email (e.g., `tech@chargerrobotics.org`)
3. Verify your email

> 💡 **POC Tip**: Using your personal Cloudflare account keeps the team burden at zero. You can transfer ownership later if the team adopts the bot.

### 2.2 Authenticate Wrangler CLI

```bash
npx wrangler login
```

This opens a browser window. Log in and authorize the CLI.

### 2.3 Verify Authentication

```bash
npx wrangler whoami
```

**Expected output**: Shows your account name and account ID

### 📤 Output from this step:
- ✅ Cloudflare account created
- ✅ Wrangler CLI authenticated
- 📝 **Account ID**: `________________________` (save this)

---

## Step 3: Create Slack App

### 3.1 Create the App

1. Go to: **https://api.slack.com/apps**
2. Click **"Create New App"**
3. Choose **"From scratch"**
4. Enter:
   - **App Name**: `ChargerBot` (or your preferred name)
   - **Workspace**: Select your team's Slack workspace
5. Click **"Create App"**

### 3.2 Configure Bot User

1. In sidebar, click **"OAuth & Permissions"**
2. Scroll to **"Scopes"** → **"Bot Token Scopes"**
3. Add these scopes:

| Scope | Purpose |
|-------|---------|
| `chat:write` | Send messages |
| `commands` | Handle slash commands |
| `users:read` | Get user info |
| `users:read.email` | Get emails for identity mapping |
| `im:history` | Read DM history |
| `im:write` | Send DMs |
| `reactions:read` | See reactions (kudos) |
| `reactions:write` | Add reactions |
| `app_mentions:read` | Respond to @mentions |

### 3.3 Install to Workspace

1. Scroll to top of **"OAuth & Permissions"**
2. Click **"Install to Workspace"**
3. Click **"Allow"**
4. Copy the **"Bot User OAuth Token"** (starts with `xoxb-`)

### 3.4 Get Signing Secret

1. In sidebar, click **"Basic Information"**
2. Scroll to **"App Credentials"**
3. Copy the **"Signing Secret"**

### 3.5 Enable Events (configure URL later)

1. In sidebar, click **"Event Subscriptions"**
2. Toggle **"Enable Events"** to ON
3. Leave Request URL blank for now (we'll set it in Step 10)
4. Under **"Subscribe to bot events"**, add:
   - `app_mention`
   - `message.im`
5. Click **"Save Changes"**

### 3.6 Create Slash Commands

1. In sidebar, click **"Slash Commands"**
2. Click **"Create New Command"** for each:

| Command | Description | Usage Hint |
|---------|-------------|------------|
| `/tasks` | List your assigned work items | |
| `/task` | Get details for a specific task | `[task-id]` |
| `/note` | Capture a quick thought | `[your note]` |
| `/stats` | View your gamification stats | |
| `/leaderboard` | View team leaderboard | |
| `/help` | Show available commands | |

3. Leave Request URL blank (set in Step 10)

### 📤 Output from this step:
- 📝 **Bot Token**: `xoxb-________________________` (save securely!)
- 📝 **Signing Secret**: `________________________` (save securely!)
- 📝 **App ID**: `________________________`
- ⚠️ Request URLs not yet configured (Step 10)

---

## Step 4: Create Atlassian OAuth App

### 4.1 Access Developer Console

1. Go to: **https://developer.atlassian.com/console/myapps/**
2. Sign in with your Atlassian account:
   - **🧪 POC Mode**: Your personal Atlassian account is fine
   - **🏭 Production Mode**: Use team Atlassian account

> 💡 **POC Tip**: The OAuth app is tied to the *developer account*, not to your Jira/Confluence site. Your personal dev account can still authorize against the team's Jira.

### 4.2 Create OAuth 2.0 App

1. Click **"Create"** → **"OAuth 2.0 integration"**
2. Enter:
   - **Name**: `Charger Robotics Slack Bot`
   - **I agree to the terms**: ✅
3. Click **"Create"**

### 4.3 Configure Permissions

1. In left sidebar, click **"Permissions"**
2. Click **"Add"** next to **"Jira API"**
3. Click **"Configure"** and add scopes:
   - `read:jira-work`
   - `write:jira-work`
   - `read:jira-user`
4. Click **"Add"** next to **"Confluence API"**
5. Click **"Configure"** and add scopes:
   - `read:confluence-content.all`
   - `write:confluence-content.all`
   - `read:confluence-user`
6. Click **"Save"**

### 4.4 Configure Authorization

1. In left sidebar, click **"Authorization"**
2. Click **"Add"** next to **"OAuth 2.0 (3LO)"**
3. Enter Callback URL (placeholder - update in Step 10):
   ```
   https://charger-bot.YOUR_SUBDOMAIN.workers.dev/oauth/atlassian/callback
   ```
4. Click **"Save changes"**

### 4.5 Get Credentials

1. In left sidebar, click **"Settings"**
2. Copy the **"Client ID"**
3. Copy the **"Secret"** (may need to generate one)

### 📤 Output from this step:
- 📝 **Atlassian Client ID**: `________________________`
- 📝 **Atlassian Client Secret**: `________________________`
- ⚠️ Callback URL needs update after deployment (Step 10)

---

## Step 5: Create GitLab Access Token

### Option A: Group Access Token (Recommended - Requires Premium)

1. Go to your GitLab group: **https://gitlab.com/groups/YOUR_GROUP/-/settings/access_tokens**
2. Click **"Add new token"**
3. Configure:
   - **Token name**: `Charger Robotics Slack Bot`
   - **Expiration date**: 1 year from now
   - **Select a role**: `Reporter`
   - **Select scopes**: ✅ `read_api`, ✅ `read_repository`
4. Click **"Create group access token"**
5. **COPY THE TOKEN IMMEDIATELY** - it won't be shown again!

### Option B: Project Access Token (Requires Premium)

Same as above, but at project level:
**https://gitlab.com/YOUR_PROJECT/-/settings/access_tokens**

### Option C: Personal Access Token (Free Tier Fallback)

⚠️ **Warning**: Use a dedicated bot account, not your personal account!

1. Create a new GitLab account with team email
2. Go to: **https://gitlab.com/-/profile/personal_access_tokens**
3. Create token with `read_api` scope
4. Add this bot user to your projects as Reporter

### 📤 Output from this step:
- 📝 **GitLab Access Token**: `glpat-________________________`
- 📝 **Token Type**: Group / Project / Personal (circle one)
- 📝 **Expiration Date**: `____/____/________`
- ⚠️ Set calendar reminder 30 days before expiration!

---

## Step 6: Create Cloudflare Resources

### Automated Setup

```bash
npm run setup:cloudflare
```

This interactive script will:
1. Verify Cloudflare authentication
2. Create KV namespace for sessions
3. Create D1 database for gamification data
4. Create Queue for async processing (if on paid plan)
5. Output the IDs needed for configuration

### Manual Setup (if automation fails)

```bash
# Create KV namespace
npx wrangler kv:namespace create "charger-bot-sessions-dev"

# Create D1 database
npx wrangler d1 create "charger-bot-dev"

# Create Queue (paid plan only)
npx wrangler queues create "charger-bot-tasks-dev"
```

### 📤 Output from this step:
- 📝 **KV Namespace ID**: `________________________`
- 📝 **D1 Database ID**: `________________________`
- 📝 **Queue Name**: `charger-bot-tasks-dev`

---

## Step 7: Configure wrangler.toml

Open `wrangler.toml` and replace the placeholder values with your IDs from Step 6:

```toml
# Find these lines and update:

[[kv_namespaces]]
binding = "SESSIONS"
id = "YOUR_KV_NAMESPACE_ID_HERE"      # ← Replace with KV ID from Step 6
preview_id = "YOUR_KV_NAMESPACE_ID_HERE"  # ← Same ID for preview

[[d1_databases]]
binding = "DB"
database_name = "charger-bot-dev"
database_id = "YOUR_D1_DATABASE_ID_HERE"  # ← Replace with D1 ID from Step 6
```

### Verify Configuration

```bash
npm run setup:check
```

**Expected output**: `wrangler.toml configured ✓`

### 📤 Output from this step:
- ✅ wrangler.toml configured with real IDs

---

## Step 8: Set Secrets

### Automated Setup

```bash
npm run setup:secrets
```

This interactive wizard will:
1. Prompt for each secret from Steps 3-5
2. Set them securely via Wrangler
3. Generate an encryption key for token storage

### Manual Setup

```bash
# Set each secret (you'll be prompted to enter the value)
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put SLACK_BOT_TOKEN
npx wrangler secret put ATLASSIAN_CLIENT_ID
npx wrangler secret put ATLASSIAN_CLIENT_SECRET
npx wrangler secret put GITLAB_ACCESS_TOKEN
npx wrangler secret put ENCRYPTION_KEY  # Use: openssl rand -hex 32
```

### Verify Secrets

```bash
npx wrangler secret list
```

**Expected output**: All 6 secrets listed

### 📤 Output from this step:
- ✅ All secrets configured in Cloudflare
- 📝 **Encryption Key**: `________________________` (SAVE IN PASSWORD MANAGER!)

---

## Step 9: Database Migration

### Run Migration

```bash
# For local development
npm run db:migrate:local

# For staging (when ready)
npm run db:migrate:staging

# For production (when ready)
npm run db:migrate:production
```

### Verify Migration

```bash
# Check tables were created
npx wrangler d1 execute charger-bot-dev --command "SELECT name FROM sqlite_master WHERE type='table'"
```

**Expected output**: List of tables including `users`, `badge_definitions`, `xp_log`, etc.

### 📤 Output from this step:
- ✅ Database schema created
- ✅ Default badge definitions seeded

---

## Step 10: Deploy and Configure URLs

### 10.1 Deploy to Cloudflare

```bash
npm run deploy
```

**Expected output**: 
```
Published charger-bot (x.xx sec)
  https://charger-bot.YOUR_SUBDOMAIN.workers.dev
```

### 📝 Record Your Worker URL:
`https://charger-bot.________________________.workers.dev`

### 10.2 Update Slack App URLs

1. Go to: **https://api.slack.com/apps** → Select your app

2. **Event Subscriptions**:
   - Request URL: `https://charger-bot.YOUR_SUBDOMAIN.workers.dev/slack/events`
   - Click **"Save Changes"**
   - Wait for verification ✓

3. **Slash Commands** - Update each command's Request URL:
   - `/tasks`: `https://charger-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`
   - `/task`: `https://charger-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`
   - `/note`: `https://charger-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`
   - `/stats`: `https://charger-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`
   - `/leaderboard`: `https://charger-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`
   - `/help`: `https://charger-bot.YOUR_SUBDOMAIN.workers.dev/slack/commands`

4. **Interactivity & Shortcuts**:
   - Toggle ON
   - Request URL: `https://charger-bot.YOUR_SUBDOMAIN.workers.dev/slack/interactions`
   - Click **"Save Changes"**

### 10.3 Update Atlassian Callback URL

1. Go to: **https://developer.atlassian.com/console/myapps/**
2. Select your app → **Authorization**
3. Update callback URL:
   ```
   https://charger-bot.YOUR_SUBDOMAIN.workers.dev/oauth/atlassian/callback
   ```
4. Click **"Save changes"**

### 📤 Output from this step:
- ✅ Worker deployed
- ✅ Slack URLs configured
- ✅ Atlassian callback URL updated

---

## Step 11: Test and Verify

### 11.1 Test Slack Connection

In Slack, try:
```
/help
```

**Expected**: Bot responds with help message

### 11.2 Test Atlassian Connection

In Slack, try:
```
/tasks
```

**Expected**: Prompts to connect Atlassian account (first time) or shows tasks

### 11.3 Test Gamification

In Slack, try:
```
/stats
```

**Expected**: Shows your XP and level (starts at 0 XP, Level 1)

### 11.4 Check Logs (if issues)

```bash
npx wrangler tail
```

This streams live logs from your Worker.

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Slack says "dispatch_failed" | Check Worker URL is correct in Slack app |
| Slack says "invalid_signature" | Verify SLACK_SIGNING_SECRET matches |
| OAuth redirect fails | Check callback URL matches exactly |
| Database errors | Re-run migration: `npm run db:migrate:local` |

---

## 📋 Complete Setup Checklist

```
□ Step 1:  Prerequisites installed
□ Step 2:  Cloudflare account created
           Account ID: ________________________
□ Step 3:  Slack App created
           Bot Token: xoxb-________________________
           Signing Secret: ________________________
□ Step 4:  Atlassian App created
           Client ID: ________________________
           Client Secret: ________________________
□ Step 5:  GitLab token created
           Access Token: glpat-________________________
           Expiration: ____/____/________
□ Step 6:  Cloudflare resources created
           KV ID: ________________________
           D1 ID: ________________________
□ Step 7:  wrangler.toml configured
□ Step 8:  Secrets set
           Encryption Key: ________________________
□ Step 9:  Database migrated
□ Step 10: Deployed and URLs configured
           Worker URL: https://________________________
□ Step 11: Tested and verified
```

---

## 🔐 Store These Securely

Copy all values above to your **team password manager**:
- Bitwarden Teams
- 1Password Teams
- Or similar

**Never commit secrets to Git!**

---

## 🔄 What's Next?

1. **Invite team members** to use the bot
2. **Set up monitoring** (Cloudflare Analytics)
3. **Configure additional environments** (staging, production)
4. **Customize gamification** (edit badge definitions in database)

See [Admin Guide](admin-guide.md) for ongoing administration.
