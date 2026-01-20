/**
 * User Service
 * 
 * Manages user records, activity tracking, and profile data
 */

import type { Env, User, UserStats } from '../types';
import { getUserInfo } from '../utils/slack-api';

/**
 * Get or create a user by Slack ID
 */
export async function getOrCreateUser(env: Env, slackUserId: string): Promise<User> {
  // Check if user exists
  const existing = await env.DB.prepare(
    'SELECT * FROM users WHERE slack_user_id = ?'
  ).bind(slackUserId).first<User>();

  if (existing) {
    return existing;
  }

  // Fetch user info from Slack
  const slackUser = await getUserInfo(env.SLACK_BOT_TOKEN, slackUserId);

  const displayName = slackUser?.real_name || slackUser?.name || slackUserId;
  const email = slackUser?.profile?.email || null;

  // Create new user
  await env.DB.prepare(`
    INSERT INTO users (
      slack_user_id, 
      display_name, 
      email,
      xp,
      level,
      current_streak,
      longest_streak,
      leaderboard_opt_in,
      created_at,
      updated_at,
      last_activity_at
    ) VALUES (?, ?, ?, 0, 1, 0, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(slackUserId, displayName, email).run();

  // Award onboarding XP
  await env.TASKS_QUEUE.send({
    type: 'award_xp',
    userId: slackUserId,
    amount: 10,
    reason: 'Welcome to ChargerBot!',
    sourceType: 'onboarding',
  });

  // Check for first-interaction badge
  await env.TASKS_QUEUE.send({
    type: 'check_badges',
    userId: slackUserId,
  });

  // Return newly created user
  const newUser = await env.DB.prepare(
    'SELECT * FROM users WHERE slack_user_id = ?'
  ).bind(slackUserId).first<User>();

  return newUser!;
}

/**
 * Update user's last activity timestamp
 */
export async function updateUserActivity(env: Env, slackUserId: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE users 
    SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE slack_user_id = ?
  `).bind(slackUserId).run();
}

/**
 * Get user's gamification stats
 */
export async function getUserStats(env: Env, slackUserId: string): Promise<UserStats> {
  const user = await env.DB.prepare(`
    SELECT 
      xp,
      level,
      current_streak,
      longest_streak
    FROM users
    WHERE slack_user_id = ?
  `).bind(slackUserId).first<{
    xp: number;
    level: number;
    current_streak: number;
    longest_streak: number;
  }>();

  const badgeCount = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM user_badges
    WHERE slack_user_id = ?
  `).bind(slackUserId).first<{ count: number }>();

  const weeklyXp = await env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM xp_log
    WHERE slack_user_id = ?
    AND awarded_at > datetime('now', '-7 days')
  `).bind(slackUserId).first<{ total: number }>();

  return {
    xp: user?.xp || 0,
    level: user?.level || 1,
    currentStreak: user?.current_streak || 0,
    longestStreak: user?.longest_streak || 0,
    badgeCount: badgeCount?.count || 0,
    weeklyXp: weeklyXp?.total || 0,
  };
}

/**
 * Get user by Slack ID
 */
export async function getUserBySlackId(env: Env, slackUserId: string): Promise<User | null> {
  return env.DB.prepare(
    'SELECT * FROM users WHERE slack_user_id = ?'
  ).bind(slackUserId).first<User>();
}

/**
 * Update user's Atlassian account mapping
 */
export async function updateAtlassianMapping(
  env: Env,
  slackUserId: string,
  atlassianAccountId: string,
  atlassianEmail: string
): Promise<void> {
  await env.DB.prepare(`
    UPDATE users 
    SET 
      atlassian_account_id = ?,
      atlassian_email = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE slack_user_id = ?
  `).bind(atlassianAccountId, atlassianEmail, slackUserId).run();
}

/**
 * Update user's GitLab account mapping
 */
export async function updateGitLabMapping(
  env: Env,
  slackUserId: string,
  gitlabUserId: number,
  gitlabUsername: string
): Promise<void> {
  await env.DB.prepare(`
    UPDATE users 
    SET 
      gitlab_user_id = ?,
      gitlab_username = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE slack_user_id = ?
  `).bind(gitlabUserId, gitlabUsername, slackUserId).run();
}

/**
 * Update user's display name
 */
export async function updateDisplayName(
  env: Env,
  slackUserId: string,
  displayName: string
): Promise<void> {
  await env.DB.prepare(`
    UPDATE users 
    SET display_name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE slack_user_id = ?
  `).bind(displayName, slackUserId).run();
}

/**
 * Get all users (for admin operations)
 */
export async function getAllUsers(env: Env): Promise<User[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM users ORDER BY created_at DESC'
  ).all<User>();

  return result.results || [];
}
