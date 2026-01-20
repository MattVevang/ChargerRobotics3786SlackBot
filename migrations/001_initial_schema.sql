-- =============================================================================
-- Charger Robotics 3786 Slack Bot - Database Schema
-- =============================================================================
-- 
-- This migration creates the initial database schema for:
-- - User identity mapping (Slack ↔ Atlassian ↔ GitLab)
-- - Gamification data (XP, levels, badges)
-- - Quick notes and audit logging
--
-- Run with: npm run db:migrate:local (or staging/production)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Users Table: Core identity mapping and gamification state
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    slack_user_id TEXT PRIMARY KEY,
    slack_username TEXT,
    slack_email TEXT,
    slack_display_name TEXT,
    
    -- Atlassian identity (populated after OAuth)
    atlassian_account_id TEXT,
    atlassian_email TEXT,
    atlassian_access_token_encrypted TEXT,
    atlassian_refresh_token_encrypted TEXT,
    atlassian_token_expires_at TEXT,
    
    -- GitLab identity (populated after linking)
    gitlab_user_id INTEGER,
    gitlab_username TEXT,
    gitlab_email TEXT,
    
    -- Gamification state
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date TEXT,
    streak_grace_used_this_week INTEGER DEFAULT 0,
    
    -- Preferences
    leaderboard_opt_in INTEGER DEFAULT 0,  -- 0=opted out, 1=opted in
    notification_preferences TEXT DEFAULT '{}',  -- JSON
    timezone TEXT DEFAULT 'America/Los_Angeles',
    
    -- Metadata
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    onboarding_completed INTEGER DEFAULT 0
);

-- Index for email lookups (identity matching)
CREATE INDEX IF NOT EXISTS idx_users_slack_email ON users(slack_email);
CREATE INDEX IF NOT EXISTS idx_users_atlassian_email ON users(atlassian_email);
CREATE INDEX IF NOT EXISTS idx_users_gitlab_email ON users(gitlab_email);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_leaderboard ON users(leaderboard_opt_in, xp DESC);

-- -----------------------------------------------------------------------------
-- Badge Definitions: Available badges in the system
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS badge_definitions (
    badge_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon_emoji TEXT,
    category TEXT,  -- 'onboarding', 'tasks', 'docs', 'code', 'streaks', 'social', 'seasonal'
    tier TEXT DEFAULT 'bronze',  -- 'bronze', 'silver', 'gold'
    xp_reward INTEGER DEFAULT 0,
    
    -- Criteria for automatic awarding
    criteria_type TEXT,  -- 'task_count', 'doc_count', 'commit_count', 'streak_days', 'manual', etc.
    criteria_value INTEGER,
    criteria_json TEXT,  -- Additional criteria as JSON
    
    -- Display
    sort_order INTEGER DEFAULT 0,
    hidden INTEGER DEFAULT 0,  -- 1=secret badge, don't show until earned
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- User Badges: Badges earned by users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
    awarded_by TEXT,  -- 'system' or admin slack_user_id for manual awards
    notes TEXT,
    
    FOREIGN KEY (slack_user_id) REFERENCES users(slack_user_id) ON DELETE CASCADE,
    FOREIGN KEY (badge_id) REFERENCES badge_definitions(badge_id) ON DELETE CASCADE,
    UNIQUE(slack_user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(slack_user_id);

-- -----------------------------------------------------------------------------
-- XP Log: Audit trail of all XP transactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xp_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL,
    xp_amount INTEGER NOT NULL,
    xp_before INTEGER,
    xp_after INTEGER,
    reason TEXT NOT NULL,
    
    -- Source tracking
    source_type TEXT,  -- 'jira', 'confluence', 'gitlab', 'streak', 'badge', 'admin', 'challenge'
    source_id TEXT,    -- e.g., 'ROBOT-123', commit SHA, badge_id
    source_url TEXT,   -- Link to the source item
    
    -- Multipliers applied
    streak_multiplier REAL DEFAULT 1.0,
    challenge_multiplier REAL DEFAULT 1.0,
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (slack_user_id) REFERENCES users(slack_user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_xp_log_user ON xp_log(slack_user_id);
CREATE INDEX IF NOT EXISTS idx_xp_log_created ON xp_log(created_at);
CREATE INDEX IF NOT EXISTS idx_xp_log_source ON xp_log(source_type, source_id);

-- -----------------------------------------------------------------------------
-- Quick Notes: Thoughts captured before becoming Jira tickets
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quick_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    
    -- Slack message context
    slack_channel_id TEXT,
    slack_message_ts TEXT,
    
    -- Promotion to Jira
    promoted_to_jira TEXT,  -- Jira issue key if promoted
    promoted_at TEXT,
    
    -- Status
    status TEXT DEFAULT 'pending',  -- 'pending', 'promoted', 'dismissed'
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (slack_user_id) REFERENCES users(slack_user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quick_notes_user ON quick_notes(slack_user_id);
CREATE INDEX IF NOT EXISTS idx_quick_notes_status ON quick_notes(status);

-- -----------------------------------------------------------------------------
-- Challenges: Weekly/seasonal challenges
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    
    -- Timing
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    
    -- Rewards
    xp_multiplier REAL DEFAULT 1.0,  -- Applied to qualifying actions
    completion_xp_bonus INTEGER DEFAULT 0,
    badge_reward_id TEXT,
    
    -- Criteria
    challenge_type TEXT,  -- 'task_count', 'doc_count', 'any_activity', etc.
    target_value INTEGER,
    qualifying_actions TEXT,  -- JSON array of action types that count
    
    -- Status
    active INTEGER DEFAULT 1,
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (badge_reward_id) REFERENCES badge_definitions(badge_id)
);

CREATE INDEX IF NOT EXISTS idx_challenges_active ON challenges(active, start_date, end_date);

-- -----------------------------------------------------------------------------
-- Challenge Progress: User progress on challenges
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS challenge_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL,
    slack_user_id TEXT NOT NULL,
    current_value INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    completed_at TEXT,
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
    FOREIGN KEY (slack_user_id) REFERENCES users(slack_user_id) ON DELETE CASCADE,
    UNIQUE(challenge_id, slack_user_id)
);

-- -----------------------------------------------------------------------------
-- Leaderboard Cache: Pre-computed leaderboard snapshots
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leaderboard_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    leaderboard_type TEXT NOT NULL,  -- 'weekly', 'season', 'all_time'
    period_start TEXT,
    period_end TEXT,
    
    -- Cached data
    rankings_json TEXT,  -- JSON array of {rank, slack_user_id, display_name, xp}
    
    computed_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_type ON leaderboard_cache(leaderboard_type, period_start);

-- -----------------------------------------------------------------------------
-- Admin Audit Log: Track administrative actions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_slack_user_id TEXT NOT NULL,
    action TEXT NOT NULL,  -- 'award_badge', 'adjust_xp', 'reset_streak', etc.
    target_slack_user_id TEXT,
    details TEXT,  -- JSON with action-specific details
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log(admin_slack_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_log(target_slack_user_id);

-- -----------------------------------------------------------------------------
-- OAuth State: Temporary storage for OAuth flows
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_state (
    state TEXT PRIMARY KEY,
    slack_user_id TEXT NOT NULL,
    provider TEXT NOT NULL,  -- 'atlassian', 'gitlab'
    redirect_uri TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON oauth_state(expires_at);

-- =============================================================================
-- Seed Data: Default badge definitions
-- =============================================================================

-- Onboarding badges
INSERT OR IGNORE INTO badge_definitions (badge_id, name, description, icon_emoji, category, tier, xp_reward, criteria_type, criteria_value, sort_order) VALUES
('first_steps', 'First Steps', 'Complete your first tracked action', '🆕', 'onboarding', 'bronze', 25, 'total_actions', 1, 1),
('connected', 'Connected', 'Link your Slack, Jira, and GitLab accounts', '🔗', 'onboarding', 'bronze', 50, 'accounts_linked', 3, 2),
('reader', 'Reader', 'View your first task details', '📖', 'onboarding', 'bronze', 10, 'tasks_viewed', 1, 3);

-- Task badges
INSERT OR IGNORE INTO badge_definitions (badge_id, name, description, icon_emoji, category, tier, xp_reward, criteria_type, criteria_value, sort_order) VALUES
('task_closer', 'Task Closer', 'Complete your first task', '✅', 'tasks', 'bronze', 25, 'tasks_completed', 1, 10),
('on_target', 'On Target', 'Complete 10 tasks', '🎯', 'tasks', 'silver', 100, 'tasks_completed', 10, 11),
('sprint_master', 'Sprint Master', 'Complete 50 tasks', '🏃', 'tasks', 'gold', 250, 'tasks_completed', 50, 12),
('bug_squasher', 'Bug Squasher', 'Close your first bug', '🐛', 'tasks', 'bronze', 50, 'bugs_closed', 1, 15),
('exterminator', 'Exterminator', 'Close 25 bugs', '🔨', 'tasks', 'gold', 200, 'bugs_closed', 25, 16);

-- Documentation badges
INSERT OR IGNORE INTO badge_definitions (badge_id, name, description, icon_emoji, category, tier, xp_reward, criteria_type, criteria_value, sort_order) VALUES
('scribe', 'Scribe', 'Create your first documentation page', '✏️', 'docs', 'bronze', 50, 'docs_created', 1, 20),
('author', 'Author', 'Create 5 documentation pages', '📖', 'docs', 'silver', 150, 'docs_created', 5, 21),
('librarian', 'Librarian', 'Create 20 documentation pages', '📚', 'docs', 'gold', 300, 'docs_created', 20, 22);

-- Code badges
INSERT OR IGNORE INTO badge_definitions (badge_id, name, description, icon_emoji, category, tier, xp_reward, criteria_type, criteria_value, sort_order) VALUES
('first_commit', 'First Commit', 'Push your first commit', '🖥️', 'code', 'bronze', 25, 'commits', 1, 30),
('coder', 'Coder', 'Push 25 commits', '⌨️', 'code', 'silver', 100, 'commits', 25, 31),
('developer', 'Developer', 'Push 100 commits', '💪', 'code', 'gold', 250, 'commits', 100, 32),
('collaborator', 'Collaborator', 'Open your first merge request', '🔀', 'code', 'bronze', 25, 'mrs_opened', 1, 35),
('merger', 'Merger', 'Get 10 merge requests merged', '✨', 'code', 'gold', 200, 'mrs_merged', 10, 36);

-- Streak badges
INSERT OR IGNORE INTO badge_definitions (badge_id, name, description, icon_emoji, category, tier, xp_reward, criteria_type, criteria_value, sort_order) VALUES
('consistent', 'Consistent', 'Maintain a 3-day streak', '🌱', 'streaks', 'bronze', 25, 'streak_days', 3, 40),
('on_fire', 'On Fire', 'Maintain a 7-day streak', '🔥', 'streaks', 'silver', 75, 'streak_days', 7, 41),
('dedicated', 'Dedicated', 'Maintain a 14-day streak', '💪', 'streaks', 'gold', 150, 'streak_days', 14, 42),
('unstoppable', 'Unstoppable', 'Maintain a 30-day streak', '⭐', 'streaks', 'gold', 300, 'streak_days', 30, 43);

-- Team badges
INSERT OR IGNORE INTO badge_definitions (badge_id, name, description, icon_emoji, category, tier, xp_reward, criteria_type, criteria_value, sort_order) VALUES
('helper', 'Helper', 'Help a teammate (peer-confirmed)', '🤝', 'social', 'bronze', 50, 'helps_given', 1, 50),
('supporter', 'Supporter', 'Give 25 kudos reactions', '👏', 'social', 'silver', 50, 'kudos_given', 25, 51),
('star', 'Star', 'Receive 25 kudos from teammates', '🌟', 'social', 'silver', 100, 'kudos_received', 25, 52);
