# Gamification System Design: Charger Robotics 3786 Bot

**Version**: 1.0  
**Date**: January 2025  
**Target Audience**: High school robotics students (ages 14-18)

---

## 1. Design Philosophy

### 1.1 Core Principles (Based on Octalysis Framework)

Our gamification system prioritizes **White Hat** mechanics that create sustainable, intrinsic motivation:

| Principle | Implementation | Why It Works |
|-----------|----------------|--------------|
| **Epic Meaning** | Connect work to team mission | Students feel part of something bigger than homework |
| **Accomplishment** | XP, levels, badges | Clear progress markers reward effort |
| **Empowerment** | Choice in how to contribute | Autonomy increases engagement |
| **Social Influence** | Team leaderboards, peer recognition | Positive social pressure, not competition |

We **minimize Black Hat** mechanics that can feel manipulative:
- ❌ No harsh punishments for inactivity
- ❌ No gambling/random reward boxes
- ❌ No pay-to-win mechanics
- ⚠️ Streaks used carefully (recoverable, not punishing)

### 1.2 FRC-Specific Considerations

| Challenge | Solution |
|-----------|----------|
| Build season = intense, off-season = quiet | Seasonal challenges, not year-round pressure |
| Students have school + extracurriculars | Low daily commitment (5 min = valid activity) |
| Mixed tech skill levels | Reward all contributions (docs, design, code, build) |
| Mentors shouldn't compete with students | Separate mentor/student tracks |

---

## 2. XP System

### 2.1 XP Sources

#### Jira Actions
| Action | XP | Notes |
|--------|-----|-------|
| Complete a task | +50 | Must transition to "Done" |
| Close a bug | +75 | Bugs are harder |
| Create a task | +10 | Encourages planning |
| Add a comment | +5 | Encourages communication |
| Update task status | +5 | Progress tracking |
| Log work time | +10 | Transparency |

#### Confluence Actions
| Action | XP | Notes |
|--------|-----|-------|
| Create documentation page | +100 | Big reward for docs |
| Update documentation | +25 | Keeping docs current |
| Add images/diagrams | +15 | Visual documentation |
| Link task to docs | +10 | Cross-referencing |

#### GitLab Actions
| Action | XP | Notes |
|--------|-----|-------|
| Commit | +10 | Base code contribution |
| Merge request opened | +25 | Proposing changes |
| Merge request merged | +50 | Code accepted |
| Code review comment | +15 | Peer review |
| Close an issue | +30 | Issue resolution |

#### Social Actions
| Action | XP | Notes |
|--------|-----|-------|
| Help a teammate (tagged) | +20 | Peer recognition required |
| Receive kudos reaction (⭐) | +5 | Team appreciation |
| Attend standup | +10 | Participation |

### 2.2 Streak Multiplier

| Consecutive Days | Multiplier | Example |
|------------------|------------|---------|
| Days 1-2 | 1.0x | 50 XP task = 50 XP |
| Days 3-6 | 1.25x | 50 XP task = 62 XP |
| Days 7-13 | 1.5x | 50 XP task = 75 XP |
| Days 14+ | 2.0x | 50 XP task = 100 XP |

**Streak Rules**:
- Any tracked action = maintains streak
- Day resets at midnight local time
- **Grace period**: 1 "oops" recovery per week (manual claim)
- **Build season bonus**: During competition prep, streaks max at 1.5x (reduce pressure)

### 2.3 Level System

| Level | Title | XP Required | Cumulative | Unlock |
|-------|-------|-------------|------------|--------|
| 1 | Rookie | 0 | 0 | Basic commands |
| 2 | Contributor | 100 | 100 | Stats command |
| 3 | Builder | 250 | 350 | Custom emoji reactions |
| 4 | Specialist | 500 | 850 | Badge display customization |
| 5 | Expert | 1,000 | 1,850 | Mentorship badge eligibility |
| 6 | Veteran | 2,000 | 3,850 | Create team challenges |
| 7 | Captain | 4,000 | 7,850 | View team analytics |
| 8 | Legend | 8,000 | 15,850 | Hall of Fame entry |
| 9 | All-Star | 15,000 | 30,850 | Permanent recognition |
| 10 | FIRST Champion | 30,000 | 60,850 | Custom title |

**Level-Up Celebration**:
- Bot posts congratulations in team channel
- Optional: fun GIF/animation
- Shows new unlock

---

## 3. Badge System

### 3.1 Badge Categories

#### 🚀 Onboarding Badges (First Week Focus)
| Badge | Description | Criteria |
|-------|-------------|----------|
| 🆕 **First Steps** | Complete your first action | Any tracked action |
| 🔗 **Connected** | Link all accounts | Slack + Jira + GitLab linked |
| 👋 **Introduced** | Say hi in team channel | Post in #general |
| 📖 **Reader** | Check your first task | Use `/task` command |

#### 📋 Task Management Badges
| Badge | Description | Criteria |
|-------|-------------|----------|
| ✅ **Task Closer** | Complete your first task | 1 task done |
| 🎯 **On Target** | Complete 10 tasks | 10 tasks done |
| 🏃 **Sprint Master** | Complete 50 tasks | 50 tasks done |
| 🏆 **Task Champion** | Complete 100 tasks | 100 tasks done |
| 🐛 **Bug Squasher** | Close your first bug | 1 bug closed |
| 🔨 **Exterminator** | Close 25 bugs | 25 bugs closed |

#### 📚 Documentation Badges
| Badge | Description | Criteria |
|-------|-------------|----------|
| ✏️ **Scribe** | Create your first doc page | 1 page created |
| 📖 **Author** | Create 5 doc pages | 5 pages created |
| 📚 **Librarian** | Create 20 doc pages | 20 pages created |
| 🎨 **Illustrator** | Add 10 diagrams | 10 images added |

#### 💻 Code Badges
| Badge | Description | Criteria |
|-------|-------------|----------|
| 🖥️ **First Commit** | Push your first commit | 1 commit |
| ⌨️ **Coder** | Push 25 commits | 25 commits |
| 💪 **Developer** | Push 100 commits | 100 commits |
| 🔀 **Collaborator** | Open your first MR | 1 MR opened |
| ✨ **Merger** | Get 10 MRs merged | 10 MRs merged |
| 👀 **Reviewer** | Review 10 MRs | 10 code reviews |

#### 🔥 Streak Badges
| Badge | Description | Criteria |
|-------|-------------|----------|
| 🌱 **Consistent** | 3-day streak | 3 consecutive days |
| 🔥 **On Fire** | 7-day streak | 7 consecutive days |
| 💪 **Dedicated** | 14-day streak | 14 consecutive days |
| ⭐ **Unstoppable** | 30-day streak | 30 consecutive days |
| 🏆 **Legendary** | 60-day streak | 60 consecutive days |

#### 🤝 Team Badges
| Badge | Description | Criteria |
|-------|-------------|----------|
| 🤝 **Helper** | Help a teammate (peer-confirmed) | 1 help acknowledgment |
| 👏 **Supporter** | Give 25 kudos reactions | 25 ⭐ given |
| 🌟 **Star** | Receive 25 kudos | 25 ⭐ received |
| 🎓 **Mentor** | Help 10 teammates (Level 5+ required) | 10 helps |

#### 🏅 Special/Seasonal Badges
| Badge | Description | Criteria |
|-------|-------------|----------|
| 🤖 **Kickoff Ready** | Active during kickoff weekend | Any action during kickoff |
| 🔧 **Build Season Hero** | 25+ tasks during build season | Build season activity |
| 🏆 **Competition Ready** | Robot shipped on time | Team milestone |
| 🎉 **Season Closer** | Participate in end-of-season | Year-end activity |
| 👴 **Veteran** | 2nd year with the team | Multi-year participation |
| 🎖️ **Founding Member** | Original bot user | First 20 users |

### 3.2 Badge Tiers

Each badge has three tiers (where applicable):

| Tier | Multiplier | Example |
|------|------------|---------|
| 🥉 Bronze | 1x criteria | 10 tasks |
| 🥈 Silver | 3x criteria | 30 tasks |
| 🥇 Gold | 10x criteria | 100 tasks |

---

## 4. Leaderboard System

### 4.1 Leaderboard Types

| Board | Timeframe | Reset | Purpose |
|-------|-----------|-------|---------|
| **Weekly** | Mon-Sun | Sunday midnight | Short-term motivation |
| **Season** | Build season | After championships | Competition focus |
| **All-Time** | Forever | Never | Legacy recognition |
| **Subteam** | Per subteam | Weekly | Intra-team competition |

### 4.2 Privacy & Safety

**Opt-In Model**:
- Users must `/join leaderboard` to appear
- Can `/leave leaderboard` anytime
- Opted-out users still earn XP, just not displayed

**Anti-Toxicity**:
- ❌ No "bottom 10" or shame boards
- ❌ No negative XP or public deductions
- ✅ Only top 10 + user's own position shown
- ✅ Celebrate everyone's progress, not just top performers

### 4.3 Display Format

```
🏆 Weekly Leaderboard (Jan 15-21)

🥇 Sarah M.      ████████████ 1,250 XP
🥈 James K.      █████████░░░   980 XP
🥉 Alex T.       ████████░░░░   820 XP
4. Maria C.      ███████░░░░░   750 XP
5. David L.      ██████░░░░░░   620 XP
...
You: #8 with 450 XP (+3 from last week!)
```

---

## 5. Challenges & Events

### 5.1 Weekly Challenges

Rotating mini-challenges to drive specific behaviors:

| Week | Challenge | Bonus |
|------|-----------|-------|
| 1 | Documentation Sprint | 2x XP for doc pages |
| 2 | Bug Bash | 2x XP for bug fixes |
| 3 | Code Review Week | 2x XP for reviews |
| 4 | Collaboration Challenge | Bonus for helping others |

### 5.2 Build Season Events

| Event | Timing | Description |
|-------|--------|-------------|
| **Kickoff Challenge** | Week 1 | Bonus XP for early activity |
| **Milestone Bonuses** | Milestones | Team-wide XP for hitting goals |
| **Ship Day Celebration** | Week 6 | Double XP day |

### 5.3 Seasonal Events

| Event | Timing | Description |
|-------|--------|-------------|
| **Off-Season Maintenance** | Summer | Bonus for keeping docs updated |
| **Mentor Appreciation** | Mentor Day | Student → Mentor kudos event |
| **Year-End Awards** | May | Superlatives and recognition |

---

## 6. Rewards (Non-XP)

### 6.1 In-Bot Rewards

| Reward | Unlock | Description |
|--------|--------|-------------|
| Custom emoji | Level 3 | Use special reactions |
| Badge showcase | Level 4 | Display 3 favorite badges |
| Custom title | Level 10 | Set your own title |
| Color themes | Various badges | Customize bot responses |

### 6.2 Suggested Real-World Rewards

(Team's discretion to implement)

| Category | Examples |
|----------|----------|
| **Recognition** | Announced at meetings, certificate |
| **Swag** | Team stickers, patches, T-shirt |
| **Privileges** | Priority for special roles, events |
| **Fun** | Pizza party at milestones, team outing |

---

## 7. Technical Implementation

### 7.1 D1 Schema (Gamification Tables)

```sql
-- See architecture-design.md for full schema
-- Key tables: users, badge_definitions, user_badges, xp_log
```

### 7.2 XP Calculation Flow

```
Event Received (e.g., Jira webhook)
    │
    ▼
Identify Action Type
    │
    ▼
Lookup Base XP Value
    │
    ▼
Apply Streak Multiplier
    │
    ▼
Apply Challenge Bonus (if active)
    │
    ▼
Queue: Award XP to User
    │
    ▼
Queue: Check Badge Criteria
    │
    ▼
Queue: Update Leaderboard Cache
    │
    ▼
Notify User (if level-up or badge earned)
```

### 7.3 Key Functions

```typescript
// gamification/xp.ts
async function awardXP(userId: string, amount: number, reason: string): Promise<void>;
async function calculateStreakMultiplier(userId: string): Promise<number>;
async function checkLevelUp(userId: string): Promise<LevelUpResult | null>;

// gamification/badges.ts
async function checkBadgeEligibility(userId: string): Promise<Badge[]>;
async function awardBadge(userId: string, badgeId: string): Promise<void>;

// gamification/leaderboard.ts
async function getWeeklyLeaderboard(): Promise<LeaderboardEntry[]>;
async function getUserRank(userId: string): Promise<number>;
```

---

## 8. Notifications & Messaging

### 8.1 Notification Types

| Event | Notification | Channel |
|-------|-------------|---------|
| XP earned | Silent (no spam) | None |
| Level up | Celebratory DM + team post | DM + #achievements |
| Badge earned | DM + optional team post | DM |
| Leaderboard change | Weekly summary | DM |
| Challenge complete | DM | DM |

### 8.2 Message Tone

**DO**:
- "Nice work! You just hit Level 3! 🎉"
- "Bug squashed! +75 XP 🐛"
- "You're on a 5-day streak! Keep it up! 🔥"

**DON'T**:
- "You haven't logged in for 3 days. Your streak is dying."
- "You're falling behind the leaderboard."
- "Only 200 more XP to catch up to Sarah."

---

## 9. Analytics & Reporting

### 9.1 Metrics to Track

| Metric | Purpose |
|--------|---------|
| Daily Active Users | Engagement health |
| Tasks completed per week | Productivity |
| Avg XP per user | Participation distribution |
| Badge unlock rate | Goal difficulty calibration |
| Streak retention | Engagement sustainability |

### 9.2 Mentor Dashboard (Future)

- Team-level statistics
- Individual progress (opt-in visibility)
- Engagement trends
- Alert for disengaged students

---

## 10. Iteration Plan

### 10.1 MVP Gamification

- Basic XP for Jira actions
- 5 levels
- 10 essential badges
- No leaderboards yet (add after testing)

### 10.2 V2 Additions

- Full badge system
- Weekly leaderboards
- Streak system
- Confluence/GitLab XP

### 10.3 V3 Additions

- Challenges and events
- Team achievements
- Mentor dashboard
- Analytics

---

## Appendix: Anti-Gaming Measures

| Concern | Mitigation |
|---------|------------|
| Spam commits for XP | Max 10 XP per commit, daily cap |
| Empty task creation | Tasks must have description |
| Self-kudos | Can't kudos own posts |
| Bot exploitation | Rate limiting, action validation |
| XP farming | Diminishing returns on repeated actions |
