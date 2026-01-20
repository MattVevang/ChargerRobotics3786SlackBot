/**
 * Badges Service
 * 
 * Handles badge eligibility checking and awarding
 */

import type { Env, Badge, UserBadge } from '../types';

/**
 * Check all badges and award any newly earned ones
 */
export async function checkAndAwardBadges(
  env: Env,
  slackUserId: string
): Promise<Badge[]> {
  // Get all badges the user hasn't earned yet
  const unearnedBadges = await env.DB.prepare(`
    SELECT b.*
    FROM badges b
    LEFT JOIN user_badges ub ON b.id = ub.badge_id AND ub.slack_user_id = ?
    WHERE ub.id IS NULL
  `).bind(slackUserId).all<Badge>();

  if (!unearnedBadges.results || unearnedBadges.results.length === 0) {
    return [];
  }

  // Check eligibility for each badge
  const newlyEarned: Badge[] = [];

  for (const badge of unearnedBadges.results) {
    const eligible = await checkBadgeEligibility(env, slackUserId, badge);
    
    if (eligible) {
      await awardBadge(env, slackUserId, badge);
      newlyEarned.push(badge);
    }
  }

  return newlyEarned;
}

/**
 * Check if user is eligible for a specific badge
 */
async function checkBadgeEligibility(
  env: Env,
  slackUserId: string,
  badge: Badge
): Promise<boolean> {
  // Parse criteria
  let criteria: Record<string, any>;
  try {
    criteria = typeof badge.criteria === 'string' 
      ? JSON.parse(badge.criteria) 
      : badge.criteria;
  } catch {
    console.error(`Invalid criteria for badge ${badge.id}:`, badge.criteria);
    return false;
  }

  switch (badge.category) {
    case 'onboarding':
      return checkOnboardingBadge(env, slackUserId, criteria);
    
    case 'productivity':
      return checkProductivityBadge(env, slackUserId, criteria);
    
    case 'documentation':
      return checkDocumentationBadge(env, slackUserId, criteria);
    
    case 'collaboration':
      return checkCollaborationBadge(env, slackUserId, criteria);
    
    case 'streak':
      return checkStreakBadge(env, slackUserId, criteria);
    
    case 'level':
      return checkLevelBadge(env, slackUserId, criteria);
    
    case 'special':
      return checkSpecialBadge(env, slackUserId, criteria);
    
    default:
      console.log(`Unknown badge category: ${badge.category}`);
      return false;
  }
}

/**
 * Award a badge to a user
 */
async function awardBadge(
  env: Env,
  slackUserId: string,
  badge: Badge
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO user_badges (slack_user_id, badge_id, earned_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).bind(slackUserId, badge.id).run();

  // Award bonus XP for the badge
  if (badge.xp_bonus > 0) {
    await env.TASKS_QUEUE.send({
      type: 'award_xp',
      userId: slackUserId,
      amount: badge.xp_bonus,
      reason: `Badge earned: ${badge.name}`,
      sourceType: 'badge',
      sourceId: badge.id,
    });
  }

  console.log(`Awarded badge "${badge.name}" to ${slackUserId}`);
}

// =============================================================================
// Category-specific eligibility checks
// =============================================================================

async function checkOnboardingBadge(
  env: Env,
  slackUserId: string,
  criteria: Record<string, any>
): Promise<boolean> {
  if (criteria.connected_atlassian) {
    const user = await env.DB.prepare(
      'SELECT atlassian_account_id FROM users WHERE slack_user_id = ?'
    ).bind(slackUserId).first<{ atlassian_account_id: string | null }>();
    
    return !!user?.atlassian_account_id;
  }

  if (criteria.connected_gitlab) {
    const user = await env.DB.prepare(
      'SELECT gitlab_user_id FROM users WHERE slack_user_id = ?'
    ).bind(slackUserId).first<{ gitlab_user_id: number | null }>();
    
    return !!user?.gitlab_user_id;
  }

  if (criteria.first_interaction) {
    // This is always true if they're in the system
    return true;
  }

  return false;
}

async function checkProductivityBadge(
  env: Env,
  slackUserId: string,
  criteria: Record<string, any>
): Promise<boolean> {
  if (criteria.tasks_completed) {
    const count = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM xp_log
      WHERE slack_user_id = ?
      AND source_type = 'jira'
      AND reason LIKE '%completed%'
    `).bind(slackUserId).first<{ count: number }>();
    
    return (count?.count || 0) >= criteria.tasks_completed;
  }

  if (criteria.tasks_completed_week) {
    const count = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM xp_log
      WHERE slack_user_id = ?
      AND source_type = 'jira'
      AND reason LIKE '%completed%'
      AND awarded_at > datetime('now', '-7 days')
    `).bind(slackUserId).first<{ count: number }>();
    
    return (count?.count || 0) >= criteria.tasks_completed_week;
  }

  return false;
}

async function checkDocumentationBadge(
  env: Env,
  slackUserId: string,
  criteria: Record<string, any>
): Promise<boolean> {
  if (criteria.pages_created) {
    const count = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM xp_log
      WHERE slack_user_id = ?
      AND source_type = 'confluence'
      AND reason LIKE '%created%'
    `).bind(slackUserId).first<{ count: number }>();
    
    return (count?.count || 0) >= criteria.pages_created;
  }

  if (criteria.pages_updated) {
    const count = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM xp_log
      WHERE slack_user_id = ?
      AND source_type = 'confluence'
      AND reason LIKE '%updated%'
    `).bind(slackUserId).first<{ count: number }>();
    
    return (count?.count || 0) >= criteria.pages_updated;
  }

  return false;
}

async function checkCollaborationBadge(
  env: Env,
  slackUserId: string,
  criteria: Record<string, any>
): Promise<boolean> {
  if (criteria.kudos_given) {
    const count = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM xp_log
      WHERE slack_user_id = ?
      AND source_type = 'kudos'
    `).bind(slackUserId).first<{ count: number }>();
    
    return (count?.count || 0) >= criteria.kudos_given;
  }

  if (criteria.comments_added) {
    const count = await env.DB.prepare(`
      SELECT COUNT(*) as count
      FROM xp_log
      WHERE slack_user_id = ?
      AND reason LIKE '%comment%'
    `).bind(slackUserId).first<{ count: number }>();
    
    return (count?.count || 0) >= criteria.comments_added;
  }

  return false;
}

async function checkStreakBadge(
  env: Env,
  slackUserId: string,
  criteria: Record<string, any>
): Promise<boolean> {
  if (criteria.streak_days) {
    const user = await env.DB.prepare(
      'SELECT current_streak, longest_streak FROM users WHERE slack_user_id = ?'
    ).bind(slackUserId).first<{ current_streak: number; longest_streak: number }>();
    
    return (user?.longest_streak || 0) >= criteria.streak_days;
  }

  return false;
}

async function checkLevelBadge(
  env: Env,
  slackUserId: string,
  criteria: Record<string, any>
): Promise<boolean> {
  if (criteria.level_reached) {
    const user = await env.DB.prepare(
      'SELECT level FROM users WHERE slack_user_id = ?'
    ).bind(slackUserId).first<{ level: number }>();
    
    return (user?.level || 1) >= criteria.level_reached;
  }

  return false;
}

async function checkSpecialBadge(
  env: Env,
  slackUserId: string,
  criteria: Record<string, any>
): Promise<boolean> {
  // Special badges are typically awarded manually or by specific events
  // The criteria field can contain event-based triggers
  
  if (criteria.event) {
    // Check if the event has been recorded for this user
    const event = await env.DB.prepare(`
      SELECT id FROM xp_log
      WHERE slack_user_id = ?
      AND source_type = 'event'
      AND source_id = ?
    `).bind(slackUserId, criteria.event).first();
    
    return !!event;
  }

  return false;
}

// =============================================================================
// Query functions
// =============================================================================

/**
 * Get all badges earned by a user
 */
export async function getUserBadges(env: Env, slackUserId: string): Promise<Array<Badge & { earned_at: string }>> {
  const result = await env.DB.prepare(`
    SELECT b.*, ub.earned_at
    FROM badges b
    INNER JOIN user_badges ub ON b.id = ub.badge_id
    WHERE ub.slack_user_id = ?
    ORDER BY ub.earned_at DESC
  `).bind(slackUserId).all<Badge & { earned_at: string }>();

  return result.results || [];
}

/**
 * Get all available badges with user progress
 */
export async function getAllBadgesWithProgress(
  env: Env,
  slackUserId: string
): Promise<Array<Badge & { earned: boolean; earned_at?: string }>> {
  const result = await env.DB.prepare(`
    SELECT 
      b.*,
      CASE WHEN ub.id IS NOT NULL THEN 1 ELSE 0 END as earned,
      ub.earned_at
    FROM badges b
    LEFT JOIN user_badges ub ON b.id = ub.badge_id AND ub.slack_user_id = ?
    ORDER BY b.category, b.tier
  `).bind(slackUserId).all<Badge & { earned: number; earned_at: string | null }>();

  return (result.results || []).map(b => ({
    ...b,
    earned: b.earned === 1,
    earned_at: b.earned_at || undefined,
  }));
}

/**
 * Get badge count by user
 */
export async function getBadgeCount(env: Env, slackUserId: string): Promise<number> {
  const result = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM user_badges WHERE slack_user_id = ?'
  ).bind(slackUserId).first<{ count: number }>();

  return result?.count || 0;
}
