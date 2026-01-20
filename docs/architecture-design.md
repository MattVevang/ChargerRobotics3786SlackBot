# Architecture Design: Charger Robotics 3786 Slack Bot

**Version**: 1.0  
**Date**: January 2026  
**Author**: AI Assistant (for Charger Robotics Team)  
**Session ID**: `mklxql3v-bb6e24ce`

---

## 1. System Overview

### 1.1 Purpose

A Slack-based bot that integrates Jira, Confluence, and GitLab to help FRC Team 3786 students track work items, collaborate on documentation, and stay engaged through gamification.

### 1.2 Core Goals

1. **Make Work Tracking Fun**: Gamification to engage high schoolers who don't love documentation
2. **Simplify Access**: Query work items via natural Slack conversation
3. **Enable Quick Capture**: Rapid thought-to-ticket workflow
4. **Ensure Succession**: Team-owned, not person-owned infrastructure

### 1.3 Non-Goals (Out of Scope for MVP)

- Real-time collaborative editing
- Voice/video integration
- Mobile app (beyond Slack mobile)
- Integration with other project management tools

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SLACK WORKSPACE                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │   Student    │  │   Student    │  │   Mentor     │                       │
│  │   (DM/Cmd)   │  │   (Channel)  │  │   (Admin)    │                       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                       │
└─────────┼─────────────────┼─────────────────┼───────────────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                         SLACK EVENTS API                                 │
    │              (app_mention, message, slash_commands)                      │
    └────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                     CLOUDFLARE WORKERS (Edge)                            │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │                    Main Worker (index.ts)                         │   │
    │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐  │   │
    │  │  │   Slack     │ │   Command   │ │   Session   │ │  Response  │  │   │
    │  │  │   Handler   │ │   Router    │ │   Manager   │ │  Builder   │  │   │
    │  │  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘  │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                                  │                                       │
    │         ┌────────────────────────┼────────────────────────┐             │
    │         ▼                        ▼                        ▼             │
    │  ┌─────────────┐          ┌─────────────┐          ┌─────────────┐      │
    │  │     KV      │          │     D1      │          │   Queues    │      │
    │  │  (Sessions) │          │ (Gamification│          │  (Async)    │      │
    │  │             │          │  & Mappings) │          │             │      │
    │  └─────────────┘          └─────────────┘          └──────┬──────┘      │
    └─────────────────────────────────────────────────────────────────────────┘
                                                                 │
                                     ┌───────────────────────────┘
                                     ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                    Queue Consumer Worker                                 │
    │  ┌─────────────────────────────────────────────────────────────────┐    │
    │  │  Heavy Tasks: API calls, XP calculations, leaderboard updates   │    │
    │  └─────────────────────────────────────────────────────────────────┘    │
    └────────────────────────────────┬────────────────────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          ▼                          ▼                          ▼
    ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
    │ Atlassian   │           │ Atlassian   │           │   GitLab    │
    │   Jira      │           │ Confluence  │           │   REST      │
    │  REST API   │           │  REST API   │           │    API      │
    │ (OAuth 2.0) │           │ (OAuth 2.0) │           │(Group Token)│
    └─────────────┘           └─────────────┘           └─────────────┘
```

---

## 3. Component Details

### 3.1 Main Worker (`src/index.ts`)

**Responsibilities**:
- Receive Slack webhook events
- Verify request signatures
- Route to appropriate handler
- Return response within 3 seconds

**Key Constraints**:
- Must respond to Slack within 3 seconds
- Heavy processing delegated to Queues

```typescript
// Pseudo-code structure
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. Verify Slack signature
    // 2. Parse event type
    // 3. Route to handler
    // 4. Queue async work if needed
    // 5. Return immediate acknowledgment
  }
}
```

### 3.2 Slack Handler (`src/handlers/slack.ts`)

**Event Types Handled**:

| Event | Action |
|-------|--------|
| `app_mention` | Parse command from mention text |
| `message` (DM) | Handle conversation flow |
| `slash_command` | Execute specific commands |
| `reaction_added` | Award bonus XP for engagement |

### 3.3 Command Router (`src/commands/router.ts`)

**Commands**:

| Command | Description | Example |
|---------|-------------|---------|
| `/tasks` | List my assigned work items | `/tasks` or "what are my tasks?" |
| `/task <id>` | Get task details | `/task ROBOT-123` |
| `/update <id>` | Update task status/notes | `/update ROBOT-123 done` |
| `/note <text>` | Quick capture a thought | `/note we should use 4" wheels` |
| `/stats` | View my gamification stats | `/stats` |
| `/leaderboard` | View team leaderboard | `/leaderboard` |
| `/help` | Show available commands | `/help` |

### 3.4 Session Manager (`src/session/manager.ts`)

**Purpose**: Maintain conversation context for natural chat interactions

**Storage**: Cloudflare KV with 1-hour TTL

```typescript
interface UserSession {
  userId: string;
  currentTicket?: string;  // Set focus on specific ticket
  lastCommand?: string;
  lastInteraction: number;
  context: Record<string, any>;
}
```

**Flow**:
1. User: "set focus to ROBOT-123"
2. Bot stores `currentTicket: "ROBOT-123"` in session
3. User: "add a note: fixed the wheel alignment"
4. Bot uses session context to add note to ROBOT-123

### 3.5 Cloudflare KV (`sessions` namespace)

**Usage**: User sessions, temporary state, OAuth tokens

**Key Patterns**:
- `session:{slack_user_id}` → Session data (1h TTL)
- `oauth:{provider}:{user_id}` → OAuth tokens (encrypted)
- `cache:jira:{issue_key}` → Issue cache (5min TTL)

### 3.6 Cloudflare D1 (`charger-bot` database)

**Tables**:

```sql
-- User mappings and gamification data
CREATE TABLE users (
  slack_user_id TEXT PRIMARY KEY,
  slack_username TEXT,
  slack_email TEXT,
  atlassian_account_id TEXT,
  gitlab_user_id INTEGER,
  display_name TEXT,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_activity_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Badge definitions
CREATE TABLE badge_definitions (
  badge_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon_emoji TEXT,
  xp_reward INTEGER DEFAULT 0,
  criteria_type TEXT,  -- 'task_count', 'streak', 'first_action', etc.
  criteria_value INTEGER,
  tier TEXT  -- 'bronze', 'silver', 'gold'
);

-- User badges earned
CREATE TABLE user_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slack_user_id TEXT REFERENCES users(slack_user_id),
  badge_id TEXT REFERENCES badge_definitions(badge_id),
  earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(slack_user_id, badge_id)
);

-- XP transaction log (for auditing)
CREATE TABLE xp_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slack_user_id TEXT REFERENCES users(slack_user_id),
  xp_amount INTEGER,
  reason TEXT,
  source_type TEXT,  -- 'jira', 'confluence', 'gitlab', 'streak', 'badge'
  source_id TEXT,    -- e.g., 'ROBOT-123'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Quick notes (before promotion to Jira)
CREATE TABLE quick_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slack_user_id TEXT REFERENCES users(slack_user_id),
  content TEXT,
  promoted_to_jira TEXT,  -- Jira issue key if promoted
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 3.7 Cloudflare Queues (`tasks` queue)

**Purpose**: Async processing for heavy operations

**Message Types**:

| Type | Payload | Action |
|------|---------|--------|
| `jira_sync` | `{ userId, issueKey }` | Fetch/update Jira issue |
| `award_xp` | `{ userId, amount, reason }` | Award XP, check level-up |
| `check_badges` | `{ userId }` | Evaluate badge criteria |
| `update_leaderboard` | `{}` | Recalculate weekly leaderboard |
| `send_notification` | `{ userId, message }` | Send Slack DM |

---

## 4. Integration Details

### 4.1 Jira Integration

**Module**: `src/integrations/jira.ts`

**Authentication**: OAuth 2.0 (3LO)

**Key Functions**:
```typescript
interface JiraClient {
  getMyIssues(userId: string): Promise<Issue[]>;
  getIssue(issueKey: string): Promise<Issue>;
  addComment(issueKey: string, comment: string): Promise<void>;
  transitionIssue(issueKey: string, transitionId: string): Promise<void>;
  createIssue(summary: string, projectKey: string): Promise<Issue>;
}
```

**XP Awards**:
- Complete a task: +50 XP
- Add a comment: +5 XP
- Create a task: +10 XP
- Close a bug: +75 XP

### 4.2 Confluence Integration

**Module**: `src/integrations/confluence.ts`

**Authentication**: Same OAuth app as Jira

**Key Functions**:
```typescript
interface ConfluenceClient {
  getPage(pageId: string): Promise<Page>;
  searchPages(query: string, spaceKey?: string): Promise<Page[]>;
  createPage(title: string, content: string, spaceKey: string): Promise<Page>;
  updatePage(pageId: string, content: string): Promise<Page>;
}
```

**XP Awards**:
- Create documentation page: +100 XP
- Update documentation: +25 XP
- Link task to documentation: +15 XP

### 4.3 GitLab Integration

**Module**: `src/integrations/gitlab.ts`

**Authentication**: Group Access Token

**Key Functions**:
```typescript
interface GitLabClient {
  getProject(projectId: number): Promise<Project>;
  getCommits(projectId: number, author?: string): Promise<Commit[]>;
  getMergeRequests(projectId: number, state: string): Promise<MR[]>;
  getIssues(projectId: number, assignee?: string): Promise<Issue[]>;
}
```

**XP Awards**:
- Commit: +10 XP
- Merge request opened: +25 XP
- Merge request merged: +50 XP
- Code review comment: +15 XP

---

## 5. Gamification System

### 5.1 XP & Leveling

**Level Thresholds**:

| Level | Title | XP Required | Cumulative |
|-------|-------|-------------|------------|
| 1 | Rookie | 0 | 0 |
| 2 | Contributor | 100 | 100 |
| 3 | Builder | 250 | 350 |
| 4 | Specialist | 500 | 850 |
| 5 | Expert | 1000 | 1850 |
| 6 | Veteran | 2000 | 3850 |
| 7 | Captain | 4000 | 7850 |
| 8 | Legend | 8000 | 15850 |

**Level-Up Benefits**:
- Level 3: Unlock custom emoji reactions
- Level 5: Unlock mentorship badge eligibility
- Level 7: Unlock admin commands

### 5.2 Badge System

**Badge Categories**:

| Category | Examples |
|----------|----------|
| **Onboarding** | "First Steps", "Connected", "Verified" |
| **Tasks** | "Task Closer", "Bug Squasher", "Feature Finisher" |
| **Documentation** | "Doc Writer", "Knowledge Sharer", "Confluence Master" |
| **Code** | "First Commit", "Code Reviewer", "Merge Master" |
| **Streaks** | "3-Day Streak", "Week Warrior", "Month of Dedication" |
| **Social** | "Team Player", "Mentor", "Hype Machine" |

### 5.3 Streaks

**Rules**:
- Activity = completing at least one tracked action per day
- Streak breaks at midnight local time if no activity
- Streak multiplier: 1.0x (days 1-2), 1.5x (days 3-6), 2.0x (7+ days)

### 5.4 Leaderboard

**Display**: Weekly leaderboard, resets Sunday midnight

**Privacy**:
- Opt-in by default (users must `/join leaderboard`)
- Can opt-out anytime
- Shows top 10, plus user's position if not in top 10
- Never shows "bottom" performers

---

## 6. Security

### 6.1 Secret Management

| Secret | Storage | Rotation |
|--------|---------|----------|
| Slack signing secret | Cloudflare env var | On compromise |
| Slack bot token | Cloudflare env var | On compromise |
| Atlassian client secret | Cloudflare env var | Annually |
| Atlassian refresh tokens | KV (encrypted) | Auto-rotating |
| GitLab group token | Cloudflare env var | Annually |
| D1 encryption key | Cloudflare env var | On compromise |

### 6.2 Request Validation

1. Verify Slack signature header (`x-slack-signature`)
2. Check timestamp freshness (reject >5 min old)
3. Validate user has required permissions

### 6.3 Data Privacy

- No PII stored beyond what Slack provides
- XP/badges are pseudonymous (Slack user ID)
- OAuth tokens encrypted at rest
- Audit log for admin actions

---

## 7. Deployment

### 7.1 Environment Configuration

**Development**:
```toml
# wrangler.toml
name = "charger-bot-dev"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "SESSIONS"
id = "xxx-dev"

[[d1_databases]]
binding = "DB"
database_name = "charger-bot-dev"
database_id = "xxx-dev"

[[queues.producers]]
binding = "TASKS_QUEUE"
queue = "charger-bot-tasks-dev"
```

**Production**:
- Separate KV namespace, D1 database, Queue
- Environment secrets via Cloudflare dashboard
- Custom domain: `bot.chargerrobotics.org` (optional)

### 7.2 CI/CD

**GitHub Actions Workflow**:
1. On push to `main`: Deploy to production
2. On pull request: Deploy to preview environment
3. Run tests before deploy

### 7.3 Monitoring

- **Cloudflare Analytics**: Request volume, errors, latency
- **Custom Logging**: Log to Cloudflare Logpush or external service
- **Alerts**: Set up alerts for error rate > 1%

---

## 8. Succession Planning

### 8.1 Account Ownership

| Account | Owner | Backup Access |
|---------|-------|---------------|
| Cloudflare | team email | 2+ mentors |
| Atlassian Developer | team email | 2+ mentors |
| GitLab | Group admins | 2+ mentors |
| Slack Workspace | Workspace admins | 2+ mentors |
| GitHub (code repo) | Org admins | All mentors |

### 8.2 Documentation Requirements

- [ ] Setup guide in `/docs/setup.md`
- [ ] Admin guide in `/docs/admin.md`
- [ ] Credential rotation guide in `/docs/credentials.md`
- [ ] Troubleshooting guide in `/docs/troubleshooting.md`

### 8.3 Knowledge Transfer Checklist

- [ ] At least 2 mentors understand architecture
- [ ] Password manager shared with leadership
- [ ] Monthly "bus factor" review
- [ ] Annual credential rotation reminder

---

## 9. MVP Scope

### 9.1 Phase 1 (MVP)

**In Scope**:
- Slack command handling (`/tasks`, `/task`, `/update`)
- Jira integration (read issues, add comments)
- Basic XP system
- User onboarding flow

**Out of Scope**:
- Confluence integration
- GitLab integration
- Advanced gamification (badges, leaderboards)
- Natural language processing

### 9.2 Phase 2

- Add Confluence integration
- Add badge system
- Add leaderboards

### 9.3 Phase 3

- Add GitLab integration
- Natural language command parsing
- Advanced analytics

---

## Appendix A: API Endpoint Reference

### Slack Webhook Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/slack/events` | POST | Slack Events API |
| `/slack/commands` | POST | Slash commands |
| `/slack/interactions` | POST | Interactive components |
| `/oauth/atlassian/callback` | GET | Atlassian OAuth callback |

---

## Appendix B: Error Handling

| Error | User Message | Action |
|-------|-------------|--------|
| Jira API 401 | "I need to reconnect to Jira. Please re-authorize." | Trigger re-auth flow |
| Jira API 403 | "You don't have permission for that task." | Log, no retry |
| Jira API 429 | "Jira is busy. I'll try again in a moment." | Queue retry with backoff |
| Jira API 5xx | "Jira is having issues. Try again later." | Queue retry with backoff |
| Queue timeout | (silent) | Log, dead-letter queue |
