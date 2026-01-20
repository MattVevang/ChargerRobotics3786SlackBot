/**
 * Type definitions for the Charger Robotics Slack Bot
 */

// =============================================================================
// Environment Bindings
// =============================================================================

export interface Env {
  // KV Namespace for sessions
  SESSIONS: KVNamespace;
  
  // D1 Database for gamification
  DB: D1Database;
  
  // Queue for async processing
  TASKS_QUEUE: Queue<QueueMessage>;
  
  // Environment variables
  ENVIRONMENT: string;
  LOG_LEVEL: string;
  BOT_NAME: string;
  TEAM_NUMBER: string;
  
  // Secrets
  SLACK_SIGNING_SECRET: string;
  SLACK_BOT_TOKEN: string;
  ATLASSIAN_CLIENT_ID: string;
  ATLASSIAN_CLIENT_SECRET: string;
  GITLAB_ACCESS_TOKEN: string;
  GITLAB_URL: string;
  ENCRYPTION_KEY: string;
}

// =============================================================================
// Queue Messages
// =============================================================================

export type QueueMessage =
  | JiraSyncMessage
  | AwardXpMessage
  | CheckBadgesMessage
  | UpdateLeaderboardMessage
  | SendNotificationMessage
  | SyncTasksMessage
  | CalculateLeaderboardMessage
  | CheckStreaksMessage;

export interface JiraSyncMessage {
  type: 'jira_sync';
  userId: string;
  issueKey: string;
}

export interface AwardXpMessage {
  type: 'award_xp';
  userId: string;
  amount: number;
  reason: string;
  sourceType: string;
  sourceId?: string;
  sourceUrl?: string;
}

export interface CheckBadgesMessage {
  type: 'check_badges';
  userId: string;
}

export interface UpdateLeaderboardMessage {
  type: 'update_leaderboard';
  leaderboardType: 'weekly' | 'season' | 'all_time';
}

export interface SendNotificationMessage {
  type: 'send_notification';
  userId: string;
  channel?: string;
  message: string;
  blocks?: SlackBlock[];
}

export interface SyncTasksMessage {
  type: 'sync_tasks';
  userId: string;
}

export interface CalculateLeaderboardMessage {
  type: 'calculate_leaderboard';
}

export interface CheckStreaksMessage {
  type: 'check_streaks';
}

// =============================================================================
// User & Session
// =============================================================================

export interface User {
  slack_user_id: string;
  slack_username?: string;
  slack_email?: string;
  slack_display_name?: string;
  
  atlassian_account_id?: string;
  atlassian_email?: string;
  
  gitlab_user_id?: number;
  gitlab_username?: string;
  gitlab_email?: string;
  
  xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date?: string;
  
  leaderboard_opt_in: boolean;
  notification_preferences: Record<string, boolean>;
  timezone: string;
  
  created_at: string;
  updated_at: string;
  onboarding_completed: boolean;
}

export interface UserSession {
  userId: string;
  currentTicket?: string;
  lastCommand?: string;
  lastInteraction: number;
  context: Record<string, unknown>;
}

// =============================================================================
// Gamification
// =============================================================================

export interface Badge {
  id: string;
  name: string;
  description?: string;
  icon_emoji: string;
  category: string;
  tier: 'bronze' | 'silver' | 'gold';
  xp_bonus: number;
  criteria: string | Record<string, any>;
}

export interface UserBadge {
  id: number;
  slack_user_id: string;
  badge_id: string;
  earned_at: string;
  awarded_by?: string;
  notes?: string;
}

export interface XpLogEntry {
  id: number;
  slack_user_id: string;
  xp_amount: number;
  xp_before: number;
  xp_after: number;
  reason: string;
  source_type: string;
  source_id?: string;
  source_url?: string;
  streak_multiplier: number;
  challenge_multiplier: number;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  slack_user_id: string;
  display_name: string;
  xp: number;
  level?: number;
}

export interface UserStats {
  xp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  badgeCount: number;
  weeklyXp: number;
}

export interface QuickNote {
  id: number;
  slack_user_id: string;
  content: string;
  channel_id?: string;
  promoted_to_jira_key?: string;
  is_dismissed: boolean;
  created_at: string;
}

// =============================================================================
// Slack Types
// =============================================================================

export interface SlackEvent {
  type: string;
  user?: string;
  channel?: string;
  text?: string;
  ts?: string;
  event_ts?: string;
  thread_ts?: string;
}

export interface SlackEventPayload {
  type: string;
  challenge?: string;
  token?: string;
  team_id?: string;
  event?: SlackEvent;
  event_id?: string;
  event_time?: number;
}

export interface SlackCommandPayload {
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
  user_id: string;
  user_name: string;
  team_id: string;
  channel_id: string;
  channel_name: string;
}

export interface SlackInteractionPayload {
  type: string;
  user: { id: string; username: string };
  trigger_id: string;
  response_url: string;
  actions?: SlackAction[];
  view?: SlackView;
}

export interface SlackAction {
  type: string;
  action_id: string;
  block_id: string;
  value?: string;
  selected_option?: { value: string };
}

export interface SlackView {
  id: string;
  callback_id: string;
  private_metadata?: string;
  state?: { values: Record<string, Record<string, { value?: string }>> };
}

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: unknown[];
  accessory?: unknown;
  block_id?: string;
}

// =============================================================================
// Jira Types
// =============================================================================

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string;
    status: { name: string; id: string };
    assignee?: { accountId: string; displayName: string };
    reporter?: { accountId: string; displayName: string };
    priority?: { name: string; id: string };
    issuetype: { name: string; id: string };
    created: string;
    updated: string;
    project: { key: string; name: string };
  };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { name: string; id: string };
}

// =============================================================================
// Confluence Types
// =============================================================================

export interface ConfluencePage {
  id: string;
  title: string;
  type: string;
  status: string;
  spaceKey?: string;
  spaceName?: string;
  version?: number;
  webUrl: string;
  bodyHtml?: string;
  excerpt?: string;
  lastModified?: string;
}

// =============================================================================
// GitLab Types
// =============================================================================

export interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
}

export interface GitLabCommit {
  id: string;
  shortId: string;
  title: string;
  message: string;
  authorName: string;
  createdAt: string;
  webUrl: string;
  projectName?: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description?: string;
  state: string;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
  author: { id: number; username: string; name: string };
  createdAt: string;
  mergedAt?: string | null;
}

export interface GitLabPipeline {
  id: number;
  status: string;
  ref: string;
  webUrl: string;
  createdAt: string;
  updatedAt: string;
}
