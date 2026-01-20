/**
 * Gamification Service
 * 
 * Handles XP awards, level calculations, streaks, and leaderboards
 */

import type { Env, LeaderboardEntry } from '../types';

/**
 * XP thresholds for each level (exponential growth)
 */
const LEVEL_THRESHOLDS = [
  0,      // Level 1: 0 XP
  100,    // Level 2: 100 XP
  350,    // Level 3: 250 more
  850,    // Level 4: 500 more
  1850,   // Level 5: 1000 more
  3850,   // Level 6: 2000 more
  7850,   // Level 7: 4000 more
  15850,  // Level 8: 8000 more
  30850,  // Level 9: 15000 more
  60850,  // Level 10: 30000 more
];

/**
 * Award XP to a user
 */
export async function awardXp(
  env: Env,
  slackUserId: string,
  amount: number,
  reason: string,
  sourceType: string,
  sourceId?: string
): Promise<void> {
  // Insert XP log entry
  await env.DB.prepare(`
    INSERT INTO xp_log (slack_user_id, amount, reason, source_type, source_id, awarded_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(slackUserId, amount, reason, sourceType, sourceId || null).run();

  // Update user's total XP
  await env.DB.prepare(`
    UPDATE users 
    SET xp = xp + ?, updated_at = CURRENT_TIMESTAMP
    WHERE slack_user_id = ?
  `).bind(amount, slackUserId).run();

  console.log(`Awarded ${amount} XP to ${slackUserId}: ${reason}`);
}

/**
 * Recalculate user's level based on total XP
 */
export async function recalculateLevel(
  env: Env,
  slackUserId: string
): Promise<{ newLevel: number; leveledUp: boolean } | null> {
  const user = await env.DB.prepare(
    'SELECT xp, level FROM users WHERE slack_user_id = ?'
  ).bind(slackUserId).first<{ xp: number; level: number }>();

  if (!user) return null;

  const newLevel = calculateLevel(user.xp);

  if (newLevel !== user.level) {
    await env.DB.prepare(
      'UPDATE users SET level = ?, updated_at = CURRENT_TIMESTAMP WHERE slack_user_id = ?'
    ).bind(newLevel, slackUserId).run();

    return { newLevel, leveledUp: newLevel > user.level };
  }

  return { newLevel, leveledUp: false };
}

/**
 * Calculate level from XP
 */
export function calculateLevel(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Get XP required for a specific level
 */
export function getXpForLevel(level: number): number {
  return LEVEL_THRESHOLDS[Math.min(level - 1, LEVEL_THRESHOLDS.length - 1)];
}

/**
 * Update user's activity streak
 */
export async function updateStreak(env: Env, slackUserId: string): Promise<void> {
  const user = await env.DB.prepare(`
    SELECT 
      last_activity_at,
      current_streak,
      longest_streak
    FROM users 
    WHERE slack_user_id = ?
  `).bind(slackUserId).first<{
    last_activity_at: string;
    current_streak: number;
    longest_streak: number;
  }>();

  if (!user) return;

  const lastActivity = new Date(user.last_activity_at);
  const now = new Date();
  const hoursSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);

  let newStreak = user.current_streak;

  if (hoursSinceActivity > 48) {
    // Streak broken - reset to 1 (they're active now)
    newStreak = 1;
  } else if (hoursSinceActivity > 20) {
    // New day, increment streak
    newStreak = user.current_streak + 1;
  }
  // else: Same day, keep current streak

  const newLongestStreak = Math.max(user.longest_streak, newStreak);

  await env.DB.prepare(`
    UPDATE users 
    SET 
      current_streak = ?,
      longest_streak = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE slack_user_id = ?
  `).bind(newStreak, newLongestStreak, slackUserId).run();
}

/**
 * Get weekly leaderboard from cache
 */
export async function getWeeklyLeaderboard(env: Env): Promise<LeaderboardEntry[]> {
  const result = await env.DB.prepare(`
    SELECT 
      slack_user_id,
      display_name,
      xp,
      rank
    FROM leaderboard_cache
    WHERE period = 'weekly'
    ORDER BY rank ASC
    LIMIT 25
  `).all<LeaderboardEntry>();

  // If cache is empty, calculate on the fly
  if (!result.results || result.results.length === 0) {
    return await calculateLeaderboardLive(env);
  }

  return result.results;
}

/**
 * Calculate leaderboard on the fly (fallback)
 */
async function calculateLeaderboardLive(env: Env): Promise<LeaderboardEntry[]> {
  const result = await env.DB.prepare(`
    SELECT 
      u.slack_user_id,
      u.display_name,
      COALESCE(SUM(x.amount), 0) as xp
    FROM users u
    LEFT JOIN xp_log x ON u.slack_user_id = x.slack_user_id
      AND x.awarded_at > datetime('now', '-7 days')
    WHERE u.leaderboard_opt_in = 1
    GROUP BY u.slack_user_id
    ORDER BY xp DESC
    LIMIT 25
  `).all<{ slack_user_id: string; display_name: string; xp: number }>();

  return (result.results || []).map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

/**
 * Get all-time leaderboard
 */
export async function getAllTimeLeaderboard(env: Env): Promise<LeaderboardEntry[]> {
  const result = await env.DB.prepare(`
    SELECT 
      slack_user_id,
      display_name,
      xp,
      level
    FROM users
    WHERE leaderboard_opt_in = 1
    ORDER BY xp DESC
    LIMIT 25
  `).all<{ slack_user_id: string; display_name: string; xp: number; level: number }>();

  return (result.results || []).map((entry, index) => ({
    slack_user_id: entry.slack_user_id,
    display_name: entry.display_name,
    xp: entry.xp,
    rank: index + 1,
  }));
}

/**
 * Get user's XP history
 */
export async function getXpHistory(
  env: Env,
  slackUserId: string,
  limit = 20
): Promise<Array<{ amount: number; reason: string; awarded_at: string }>> {
  const result = await env.DB.prepare(`
    SELECT amount, reason, awarded_at
    FROM xp_log
    WHERE slack_user_id = ?
    ORDER BY awarded_at DESC
    LIMIT ?
  `).bind(slackUserId, limit).all<{ amount: number; reason: string; awarded_at: string }>();

  return result.results || [];
}
