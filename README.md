# Charger Robotics 3786 Slack Bot

> A gamified Slack bot that integrates Jira, Confluence, and GitLab to help FRC Team 3786 students track work items and stay engaged through fun game mechanics.

**Status**: � Implementation In Progress

---

## 🎯 Project Goals

1. **Make Work Tracking Fun**: Gamification mechanics (XP, levels, badges, leaderboards) to engage high school students
2. **Simplify Access**: Query work items through natural Slack conversations
3. **Enable Quick Capture**: Rapid thought-to-ticket workflows
4. **Ensure Succession**: Team-owned infrastructure that survives mentor transitions

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Setup Guide](docs/SETUP.md) | Complete setup instructions with dependency chain |
| [Phase 1 Research Summary](docs/phase1-research-summary.md) | API research, gamification patterns, technology decisions |
| [Architecture Design](docs/architecture-design.md) | System architecture, components, data flow |
| [Gamification System](docs/gamification-system.md) | XP, levels, badges, leaderboards design |
| [Succession Planning](docs/succession-planning.md) | Account ownership, handoff procedures |

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run full setup (checks prerequisites, creates resources, sets secrets)
npm run setup:full

# 3. Start local development
npm run dev

# 4. Deploy to Cloudflare
npm run deploy
```

See [docs/SETUP.md](docs/SETUP.md) for the complete 11-step setup guide with dependency chains.

---

## 📁 Project Structure

```
ChargerRobotics3786SlackBot/
├── docs/                          # Documentation
│   ├── SETUP.md                   # Complete setup guide
│   ├── architecture-design.md     # System architecture
│   ├── gamification-system.md     # XP/badges/leaderboards
│   ├── phase1-research-summary.md # Research findings
│   └── succession-planning.md     # Account ownership
├── migrations/                    # Database migrations
│   └── 001_initial_schema.sql     # Full D1 schema
├── scripts/                       # Automation scripts
│   ├── setup-check.js             # Prerequisites validation
│   ├── setup-cloudflare.js        # Create KV/D1/Queues
│   └── setup-secrets.js           # Interactive secrets wizard
├── src/
│   ├── handlers/                  # Request handlers
│   │   ├── oauth-atlassian.ts     # Atlassian OAuth flow
│   │   ├── queue.ts               # Async queue consumer
│   │   ├── slack-commands.ts      # Slash commands
│   │   ├── slack-events.ts        # Event API handling
│   │   └── slack-interactions.ts  # Button clicks, modals
│   ├── services/                  # Business logic
│   │   ├── badges-service.ts      # Badge eligibility & awarding
│   │   ├── confluence-service.ts  # Confluence API
│   │   ├── gamification-service.ts# XP, levels, leaderboards
│   │   ├── gitlab-service.ts      # GitLab API
│   │   ├── jira-service.ts        # Jira API
│   │   ├── notes-service.ts       # Quick notes
│   │   └── user-service.ts        # User management
│   ├── utils/                     # Utilities
│   │   ├── slack-api.ts           # Slack API helpers
│   │   └── slack-verify.ts        # Request verification
│   ├── index.ts                   # Main Worker entry
│   └── types.ts                   # TypeScript definitions
├── tests/                         # Test files
│   └── basic.test.ts              # Unit tests
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript config
├── vitest.config.ts               # Test config
└── wrangler.toml                  # Cloudflare Workers config
```

---

## 🏗️ Architecture Overview

```
Slack Workspace
      │
      ▼
Cloudflare Workers (Edge)
      │
      ├── KV (Sessions)
      ├── D1 (Gamification Data)
      └── Queues (Async Processing)
      │
      ▼
┌─────────────────────────────────┐
│     External Integrations        │
├─────────────┬─────────┬─────────┤
│    Jira     │Confluence│ GitLab  │
│ (OAuth 2.0) │(OAuth 2.0)│(Group)  │
└─────────────┴─────────┴─────────┘
```

---

## 🎮 Gamification Features

### XP System
- Earn XP for completing tasks, writing docs, committing code
- Streak multipliers for consistent daily activity (up to 2x)
- 10 levels from "Rookie" to "FIRST Champion"

### Badges
- **Onboarding**: First Steps, Connected, Introduced
- **Tasks**: Task Closer, Bug Squasher, Sprint Master
- **Docs**: Scribe, Author, Librarian
- **Code**: First Commit, Merger, Reviewer
- **Streaks**: On Fire, Dedicated, Unstoppable

### Leaderboards
- Weekly, seasonal, and all-time boards
- Opt-in privacy model
- Positive-only (no shame boards)

---

## 🔧 Slash Commands

| Command | Description |
|---------|-------------|
| `/tasks` | List my assigned work items |
| `/task <id>` | Get task details |
| `/note <text>` | Quick capture a thought |
| `/stats` | View my gamification stats |
| `/leaderboard` | View team leaderboard |
| `/help` | Show available commands |

---

## 📋 Project Status

### ✅ Completed
- [x] Phase 1: Research (Slack, Jira, Confluence, GitLab, Cloudflare Workers, Gamification)
- [x] Phase 2: Validation & Go/No-Go Assessment (✅ GO)
- [x] Phase 3: Design Documents
- [x] Phase 4: Implementation
  - [x] Project scaffolding
  - [x] Core Worker + Slack handling
  - [x] Jira integration
  - [x] Confluence integration
  - [x] GitLab integration
  - [x] Gamification engine
  - [x] User identity mapping

### 🚧 In Progress
- [ ] Phase 5: Testing & Polish
- [ ] Phase 6: Deployment & Handoff Documentation

---

## 🔐 Succession Planning

This project is designed for team ownership, not individual control:

- **All accounts use team email** (tech@chargerrobotics.org)
- **2+ admins on every service**
- **Credentials in shared password manager**
- **Full documentation for handoff**

See [Succession Planning](docs/succession-planning.md) for details.

---

## 📁 Project Structure (Planned)

```
charger-bot/
├── src/
│   ├── index.ts              # Main Worker entry point
│   ├── handlers/
│   │   └── slack.ts          # Slack event handlers
│   ├── commands/
│   │   ├── router.ts         # Command routing
│   │   ├── tasks.ts          # Task commands
│   │   ├── stats.ts          # Gamification commands
│   │   └── help.ts           # Help command
│   ├── integrations/
│   │   ├── jira.ts           # Jira API client
│   │   ├── confluence.ts     # Confluence API client
│   │   └── gitlab.ts         # GitLab API client
│   ├── gamification/
│   │   ├── xp.ts             # XP calculation
│   │   ├── badges.ts         # Badge system
│   │   ├── levels.ts         # Level system
│   │   └── leaderboard.ts    # Leaderboard logic
│   ├── session/
│   │   └── manager.ts        # User session management
│   └── utils/
│       ├── slack-verify.ts   # Request verification
│       └── response.ts       # Response builders
├── docs/
│   ├── phase1-research-summary.md
│   ├── architecture-design.md
│   ├── gamification-system.md
│   └── succession-planning.md
├── wrangler.toml             # Cloudflare config
├── package.json
└── README.md
```

---

## 🤝 Contributing

1. Read the [Architecture Design](docs/architecture-design.md)
2. Check the project status above for what needs work
3. Create a feature branch
4. Submit a pull request

---

## 📄 License

MIT License - See LICENSE file

---

## 🙏 Acknowledgments

- **FIRST Robotics** for inspiring students in STEM
- **Charger Robotics Team 3786** for being awesome
- **Octalysis Framework** for gamification research

---

*Built with ❤️ for FRC Team 3786*
