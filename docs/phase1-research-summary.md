# Phase 1 Research Summary: Charger Robotics 3786 Slack Bot

**Session ID**: `mklxql3v-bb6e24ce`  
**Date**: January 2026  
**Status**: ✅ Research Complete

---

## Executive Summary

This document summarizes comprehensive research for building a gamified Slack bot for FRC Team 3786 (Charger Robotics) that integrates with Jira, Confluence, and GitLab, hosted on Cloudflare Workers. The research addresses API capabilities, platform constraints, authentication strategies, and gamification principles for high school student engagement.

---

## 1. Gamification Research

### 1.1 The Octalysis Framework (Yu-kai Chou)

The Octalysis Framework identifies **8 Core Drives** that motivate human behavior. For high school students who "don't love documentation and work items," we should focus on:

#### High-Priority Core Drives for FRC Students:

| Core Drive | Application to Bot | Priority |
|------------|-------------------|----------|
| **Epic Meaning & Calling** | "Help your team win competitions by tracking progress" - Connect work items to team mission | ⭐⭐⭐ |
| **Development & Accomplishment** | XP, levels, badges for completing work items, closing tickets | ⭐⭐⭐ |
| **Social Influence & Relatedness** | Team leaderboards, peer recognition, "X completed their task!" | ⭐⭐⭐ |
| **Ownership & Possession** | Personal stats dashboard, customizable profile, owned achievements | ⭐⭐ |
| **Empowerment of Creativity** | Let students propose solutions, not just execute assigned tasks | ⭐⭐ |
| **Unpredictability & Curiosity** | Random bonus XP, mystery achievements, surprise rewards | ⭐ |
| **Scarcity & Impatience** | Limited-time challenges, seasonal competitions | ⭐ |
| **Loss & Avoidance** | Streak maintenance, "don't lose your progress!" (use sparingly) | ⚠️ |

#### White Hat vs Black Hat Gamification

**Recommended: White Hat Gamification** (top core drives)
- Makes users feel empowered and good
- Sustainable long-term engagement
- Focus on: Epic Meaning, Accomplishment, Creativity

**Avoid Heavy Use: Black Hat Gamification** (bottom core drives)
- Creates urgency but can feel manipulative
- Students may resent the system over time
- Minimize: Scarcity, Loss & Avoidance

#### Intrinsic vs Extrinsic Motivation

| Type | Examples | Recommendation |
|------|----------|----------------|
| **Intrinsic** (Right Brain) | Creativity, social connection, curiosity | Primary focus - sustainable |
| **Extrinsic** (Left Brain) | Points, badges, leaderboards | Secondary - use to bootstrap engagement |

> **Key Insight**: Over-reliance on extrinsic rewards can DECREASE motivation when rewards stop. Build intrinsic value into the experience.

### 1.2 Game Mechanics to Implement

Based on research from Growth Engineering and Octalysis:

| Mechanic | Implementation | Engagement Driver |
|----------|---------------|-------------------|
| **Experience Points (XP)** | Earned for: completing tasks, updating tickets, adding docs | Progress, Accomplishment |
| **Levels** | Student levels (Rookie → Veteran → Captain) unlock features | Status, Progression |
| **Badges** | "First Commit", "Documentation Hero", "Bug Squasher" | Achievement, Collection |
| **Leaderboards** | Weekly team leaderboard (opt-in), seasonal competitions | Competition, Social |
| **Streaks** | Daily/weekly activity streaks with multipliers | Habit formation |
| **Progress Bars** | Visual progress to next level, project completion % | Motivation, Goals |
| **Challenges** | Time-limited team challenges: "Close 10 bugs this week" | Urgency, Collaboration |

### 1.3 Gamification Design Phases (Level 2 Octalysis)

| Phase | Focus | Key Mechanics |
|-------|-------|---------------|
| **Discovery** | Why should students use this bot? | Epic meaning, team mission |
| **Onboarding** | First-time user experience | Easy wins, tutorial badges, beginner XP boost |
| **Scaffolding** | Regular daily/weekly usage | Streaks, progress, variety |
| **Endgame** | Veteran retention | Mentorship badges, special challenges, leadership roles |

### 1.4 Anti-Patterns to Avoid

Based on "The Dark Side of Gamification" research:

1. **Demotivating Leaderboards**: Don't show students at bottom - use "personal best" or cohort-based
2. **Meaningless Badges**: Every badge should have clear, achievable criteria
3. **Grind without Purpose**: XP should connect to meaningful milestones
4. **Forced Competition**: Always offer collaborative alternatives
5. **Public Shaming**: Never highlight incomplete work publicly

---

## 2. API Research Summary

### 2.1 Slack Events API

| Feature | Details |
|---------|---------|
| **Protocol** | HTTP POST webhooks to endpoint |
| **Response Time** | Must respond within 3 seconds |
| **Rate Limit** | 30,000 events per workspace per app per 60 minutes |
| **Key Events** | `app_mention`, `message`, `reaction_added`, `member_joined_channel` |
| **Bot Tokens** | `xoxb-` prefix, requires OAuth 2.0 installation |
| **Recommended Framework** | Slack Bolt (TypeScript/JavaScript) |

**Implementation Notes**:
- Use Slack Bolt framework for easier event handling
- Implement request deduplication (Slack may retry)
- Queue heavy processing (Cloudflare Queues) to meet 3-second requirement

### 2.2 Jira REST API v3

| Feature | Details |
|---------|---------|
| **Base URL** | `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3` |
| **Authentication** | OAuth 2.0 (3LO) - recommended for team ownership |
| **Rate Limits** | Varies by endpoint, typically 100 requests/minute |
| **Key Endpoints** | `/issue/{issueIdOrKey}`, `/search`, `/issue/{id}/transitions` |
| **Rich Text** | Atlassian Document Format (ADF) for descriptions/comments |

**Key Scopes Needed**:
- `read:jira-work` - Read issues
- `write:jira-work` - Create/update issues, transitions
- `read:jira-user` - User lookups for mapping

### 2.3 Confluence REST API v2

| Feature | Details |
|---------|---------|
| **Base URL** | `https://api.atlassian.com/ex/confluence/{cloudId}/wiki/api/v2` |
| **Authentication** | Same OAuth 2.0 app as Jira |
| **Pagination** | Cursor-based via `Link` header |
| **Key Endpoints** | `/pages`, `/pages/{id}`, `/spaces` |
| **Body Formats** | `storage`, `atlas_doc_format`, `view` |

**Key Scopes Needed**:
- `read:page:confluence` - Read pages
- `write:page:confluence` - Create/update pages
- `read:space:confluence` - List spaces

### 2.4 GitLab REST API v4

| Feature | Details |
|---------|---------|
| **Base URL** | `https://gitlab.com/api/v4` (or self-hosted) |
| **Authentication** | Group Access Token (recommended) or Project Access Token |
| **Rate Limits** | 2000 requests/minute authenticated |
| **Key Endpoints** | `/projects/:id`, `/projects/:id/issues`, `/projects/:id/merge_requests` |
| **Webhooks** | Auto-disable after 4 consecutive failures |

**Token Scopes Needed**:
- `read_api` - Read-only access
- `api` - Full access (if creating issues)
- `read_repository` - For commit data

### 2.5 Cloudflare Workers Platform

| Resource | Free Tier | Paid ($5/mo) |
|----------|-----------|--------------|
| **Requests** | 100,000/day | 10M included (+$0.30/M) |
| **CPU Time** | 10ms | 30M ms included (+$0.02/M CPU ms) |
| **Max CPU** | 10ms | 5 minutes |
| **Memory** | 128MB | 128MB |
| **Worker Size** | 3MB | 10MB |

**Storage Options**:

| Storage | Best For | Limits |
|---------|----------|--------|
| **KV** | Session state, user preferences | 1 write/sec/key, 25MB value, 512B key |
| **D1** | Gamification data, user stats | 5GB free, 5M reads/day free |
| **Durable Objects** | Real-time leaderboards, counters | Per-object single-threaded |
| **R2** | Large file storage | 10GB free storage |
| **Queues** | Async processing | 1M messages/month free |

---

## 3. Authentication Strategy for Team Ownership

### 3.1 The Succession Planning Challenge

> "What if some day I moved to Europe and was not still here?"

All credentials must be **team-owned**, not tied to any individual's personal account.

### 3.2 Recommended Approach

| Service | Authentication | Team Ownership Strategy |
|---------|---------------|------------------------|
| **Atlassian (Jira/Confluence)** | OAuth 2.0 (3LO) App | Register app under team Atlassian Developer account |
| **GitLab** | Group Access Token | Create token at group level, not personal |
| **Slack** | Bot OAuth Token | Install to team workspace, managed by workspace admins |
| **Cloudflare** | Account Access | Use team email for account ownership |

### 3.3 Atlassian OAuth 2.0 (3LO) Setup

**Flow**:
1. Create OAuth app in [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Configure callback URL to Cloudflare Worker
3. User authorizes app → receives authorization code
4. Exchange code for access token + refresh token
5. Store tokens securely in Cloudflare KV (encrypted)

**Key Details**:
- Authorization URL: `https://auth.atlassian.com/authorize`
- Token URL: `https://auth.atlassian.com/oauth/token`
- Refresh tokens: 90-day inactivity expiry, add `offline_access` scope
- Get Cloud ID: `GET https://api.atlassian.com/oauth/token/accessible-resources`

**Team Ownership**:
- Create dedicated Atlassian account with team email (e.g., `tech@chargerrobotics.org`)
- Register OAuth app under this account
- Document credentials in secure team password manager
- Multiple team leads should have access to developer console

### 3.4 GitLab Group Access Token

**Why Group Tokens** (not personal access tokens):
- Not tied to any individual user
- Creates a non-billable bot user automatically
- Can be rotated without disrupting personal accounts
- Inherits from group, covers all subprojects

**Setup**:
1. Navigate to Group > Settings > Access Tokens
2. Create token with required scopes (`read_api`, `api`)
3. Set maximum lifetime (365 days, extendable to 400 in GitLab 17.6+)
4. Store token in Cloudflare environment secrets
5. Set calendar reminder 60 days before expiry

**⚠️ Note**: Group access tokens require GitLab Premium/Ultimate on GitLab.com. Consider self-hosted GitLab if budget constrained.

### 3.5 Slack Bot Token

**Setup**:
1. Create Slack App in team workspace
2. Use OAuth 2.0 to install app
3. Bot token (`xoxb-`) stored in Cloudflare environment secrets
4. App managed by workspace admins (multiple people)

### 3.6 Credential Storage

| Secret | Storage Location | Access Control |
|--------|-----------------|----------------|
| Atlassian OAuth refresh tokens | Cloudflare KV (encrypted namespace) | Worker only |
| GitLab group token | Cloudflare environment secret | Worker only |
| Slack bot token | Cloudflare environment secret | Worker only |
| Cloudflare API token | N/A (native) | Account admins |

**Rotation Schedule**:
- GitLab tokens: Annually (with 60-day advance notice)
- Atlassian refresh tokens: Auto-rotating (monitor for failures)
- Slack tokens: Rotate if compromised

---

## 4. Architecture Constraints

### 4.1 Cloudflare Workers Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| 3-second Slack response | Can't do heavy processing inline | Use Cloudflare Queues for async |
| 10ms CPU (free) / 5min (paid) | Limited computation per request | Pre-compute leaderboards, cache aggressively |
| 128MB memory | Can't load large datasets | Use D1/KV for data, stream responses |
| 1 write/sec/key (KV) | Rate limit on hot keys | Use Durable Objects for counters |
| No WebSockets (standard) | Can't maintain connections | Use Socket Mode via Durable Objects or poll |

### 4.2 API Rate Limits Summary

| API | Rate Limit | Strategy |
|-----|------------|----------|
| Slack Events | 30K events/60min | Well within expected usage |
| Jira REST | ~100 req/min | Batch queries, cache results |
| Confluence REST | Similar to Jira | Cache page content |
| GitLab REST | 2000 req/min | Generous, no special handling |

### 4.3 Recommended Architecture Pattern

```
┌─────────────────┐     ┌──────────────────┐
│   Slack Event   │────▶│ Cloudflare Worker │
│   (Webhook)     │     │   (Edge Handler)  │
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
              ┌─────────┐  ┌─────────┐  ┌─────────┐
              │   KV    │  │   D1    │  │ Queues  │
              │(Session)│  │(Gamify) │  │(Async)  │
              └─────────┘  └─────────┘  └────┬────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │ Queue Consumer  │
                                    │ (Heavy Tasks)   │
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
            ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
            │   Jira API   │        │ Confluence   │        │  GitLab API  │
            │  (OAuth 2.0) │        │    API       │        │(Group Token) │
            └──────────────┘        └──────────────┘        └──────────────┘
```

---

## 5. User Identity Mapping

### 5.1 The Challenge

Students use:
- **Slack**: School email or personal email
- **Atlassian**: Team-provisioned or personal
- **GitLab**: Personal or school account

### 5.2 Recommended Approach

1. **Primary Key**: Slack User ID (immutable)
2. **Mapping Table** (D1):
   ```sql
   CREATE TABLE user_mappings (
     slack_user_id TEXT PRIMARY KEY,
     slack_email TEXT,
     atlassian_account_id TEXT,
     gitlab_user_id INTEGER,
     display_name TEXT,
     xp INTEGER DEFAULT 0,
     level INTEGER DEFAULT 1,
     created_at TIMESTAMP,
     updated_at TIMESTAMP
   );
   ```
3. **Onboarding Flow**:
   - Bot DMs new user asking to connect accounts
   - OAuth flow for Atlassian (gets `account_id`)
   - Manual GitLab username entry or webhook correlation

---

## 6. Go/No-Go Assessment

### 6.1 Feasibility: ✅ GO

| Criterion | Assessment |
|-----------|------------|
| **Technical Feasibility** | ✅ All APIs support required operations |
| **Platform Constraints** | ✅ Cloudflare Workers adequate with async processing |
| **Cost** | ✅ Free tier likely sufficient for team size |
| **Team Ownership** | ✅ Achievable with proper setup |
| **Student Engagement** | ✅ Gamification framework well-researched |

### 6.2 Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GitLab Premium requirement | Medium | High | Consider self-hosted or project tokens |
| OAuth token refresh failures | Medium | Medium | Monitor, alert, auto-retry logic |
| Low student adoption | Medium | High | Focus on White Hat gamification, iterate on feedback |
| Mentor departure | Known | High | Document everything, team-owned credentials |

### 6.3 Recommended Next Steps

1. **Phase 3.1**: Create detailed architecture design document
2. **Phase 3.2**: Design gamification system with student input
3. **Phase 3.4**: Set up team-owned accounts before implementation
4. **Phase 4.1**: Start with Slack + Jira MVP, add gamification second

---

## Appendix A: Research Sources

1. Yu-kai Chou, "The Octalysis Framework for Gamification & Behavioral Design" - https://yukaichou.com/gamification-examples/octalysis-complete-gamification-framework/
2. Growth Engineering, "What is Gamification?" - https://www.growthengineering.co.uk/what-is-gamification/
3. Slack API Documentation - https://api.slack.com/apis/events-api
4. Atlassian REST API - https://developer.atlassian.com/cloud/jira/platform/rest/v3/
5. Atlassian OAuth 2.0 (3LO) - https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/
6. GitLab REST API - https://docs.gitlab.com/ee/api/rest/
7. GitLab Access Tokens - https://docs.gitlab.com/ee/user/group/settings/group_access_tokens.html
8. Cloudflare Workers - https://developers.cloudflare.com/workers/
9. Frontiers in Education - "Reciprocal Predictions Between Interest, Self-Efficacy, and Performance During a Task"

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **3LO** | Three-Legged OAuth - OAuth flow involving user consent |
| **ADF** | Atlassian Document Format - JSON-based rich text |
| **Core Drive** | Fundamental human motivation in Octalysis framework |
| **D1** | Cloudflare's serverless SQLite database |
| **Durable Objects** | Cloudflare's stateful serverless compute |
| **FRC** | FIRST Robotics Competition |
| **KV** | Cloudflare Key-Value store |
| **White Hat Gamification** | Positive, empowering game mechanics |
| **Black Hat Gamification** | Urgency/scarcity-based mechanics |
| **XP** | Experience Points |
