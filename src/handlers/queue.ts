/**
 * Queue Consumer
 * 
 * Handles async processing of XP awards, badge checks, and other background tasks
 */

import type { Env, QueueMessage, AwardXpMessage, CheckBadgesMessage, SyncTasksMessage, SendNotificationMessage } from '../types';
import { awardXp, recalculateLevel, updateStreak } from '../services/gamification-service';
import { checkAndAwardBadges } from '../services/badges-service';
import { syncUserTasks } from '../services/jira-service';
import { postMessage, textBlock, headerBlock } from '../utils/slack-api';

/**
 * Main queue consumer
 */
export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env
): Promise<void> {
  console.log(`Processing ${batch.messages.length} queued messages`);

  for (const message of batch.messages) {
    try {
      await processMessage(message.body, env);
      message.ack();
    } catch (error) {
      console.error(`Error processing message:`, error, message.body);
      // Retry up to 3 times
      if (message.attempts < 3) {
        message.retry();
      } else {
        console.error(`Message failed after ${message.attempts} attempts, discarding`);
        message.ack();
      }
    }
  }
}

/**
 * Route message to appropriate handler
 */
async function processMessage(message: QueueMessage, env: Env): Promise<void> {
  switch (message.type) {
    case 'award_xp':
      await handleAwardXp(message, env);
      break;

    case 'check_badges':
      await handleCheckBadges(message, env);
      break;

    case 'sync_tasks':
      await handleSyncTasks(message, env);
      break;

    case 'send_notification':
      await handleSendNotification(message, env);
      break;

    case 'calculate_leaderboard':
      await handleCalculateLeaderboard(env);
      break;

    case 'check_streaks':
      await handleCheckStreaks(env);
      break;

    default:
      console.log(`Unknown message type:`, message);
  }
}

/**
 * Award XP to a user
 */
async function handleAwardXp(message: AwardXpMessage, env: Env): Promise<void> {
  const { userId, amount, reason, sourceType, sourceId } = message;

  console.log(`Awarding ${amount} XP to ${userId}: ${reason}`);

  // Check for duplicate (same source within 5 minutes)
  if (sourceId) {
    const recent = await env.DB.prepare(`
      SELECT id FROM xp_log 
      WHERE slack_user_id = ? AND source_type = ? AND source_id = ?
      AND awarded_at > datetime('now', '-5 minutes')
    `).bind(userId, sourceType, sourceId).first();

    if (recent) {
      console.log(`Skipping duplicate XP award for ${sourceId}`);
      return;
    }
  }

  // Get user's current streak for multiplier
  const user = await env.DB.prepare(
    'SELECT current_streak FROM users WHERE slack_user_id = ?'
  ).bind(userId).first<{ current_streak: number }>();

  const streakMultiplier = calculateStreakMultiplier(user?.current_streak || 0);
  const finalAmount = Math.round(amount * streakMultiplier);

  // Award XP
  await awardXp(env, userId, finalAmount, reason, sourceType, sourceId);

  // Check if user leveled up
  const newLevel = await recalculateLevel(env, userId);

  if (newLevel?.leveledUp) {
    // Send level up notification
    await env.TASKS_QUEUE.send({
      type: 'send_notification',
      userId,
      message: `🎉 Level up! You're now **Level ${newLevel.newLevel}** - ${getLevelTitle(newLevel.newLevel)}!`,
    } as SendNotificationMessage);

    // Check for level badges
    await env.TASKS_QUEUE.send({ type: 'check_badges', userId } as CheckBadgesMessage);
  }

  // Update streak
  await updateStreak(env, userId);
}

/**
 * Check and award eligible badges
 */
async function handleCheckBadges(message: CheckBadgesMessage, env: Env): Promise<void> {
  const { userId } = message;

  console.log(`Checking badges for ${userId}`);

  const newBadges = await checkAndAwardBadges(env, userId);

  if (newBadges.length > 0) {
    // Notify user of new badges
    const badgeNames = newBadges.map(b => `🎖️ ${b.name}`).join('\n');
    
    await env.TASKS_QUEUE.send({
      type: 'send_notification',
      userId,
      message: `You earned new badges!\n\n${badgeNames}`,
    } as SendNotificationMessage);
  }
}

/**
 * Sync tasks from Jira for a user
 */
async function handleSyncTasks(message: SyncTasksMessage, env: Env): Promise<void> {
  const { userId } = message;

  console.log(`Syncing tasks for ${userId}`);

  await syncUserTasks(env, userId);
}

/**
 * Send a notification to a user via DM
 */
async function handleSendNotification(message: SendNotificationMessage, env: Env): Promise<void> {
  const { userId, message: text, blocks } = message;

  console.log(`Sending notification to ${userId}`);

  // Open DM channel
  const response = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ users: userId }),
  });

  const result = await response.json() as { ok: boolean; channel?: { id: string } };

  if (!result.ok || !result.channel) {
    console.error('Failed to open DM channel');
    return;
  }

  await postMessage(env.SLACK_BOT_TOKEN, result.channel.id, text, {
    blocks: blocks || [textBlock(text)],
  });
}

/**
 * Calculate weekly leaderboard
 */
async function handleCalculateLeaderboard(env: Env): Promise<void> {
  console.log('Calculating weekly leaderboard');

  // Get weekly XP totals for opted-in users
  const weeklyStats = await env.DB.prepare(`
    SELECT 
      u.slack_user_id,
      u.display_name,
      COALESCE(SUM(x.amount), 0) as weekly_xp
    FROM users u
    LEFT JOIN xp_log x ON u.slack_user_id = x.slack_user_id
      AND x.awarded_at > datetime('now', '-7 days')
    WHERE u.leaderboard_opt_in = 1
    GROUP BY u.slack_user_id
    ORDER BY weekly_xp DESC
  `).all<{ slack_user_id: string; display_name: string; weekly_xp: number }>();

  if (!weeklyStats.results) return;

  // Clear old cache and insert new
  await env.DB.batch([
    env.DB.prepare('DELETE FROM leaderboard_cache WHERE period = ?').bind('weekly'),
    ...weeklyStats.results.map((entry, index) =>
      env.DB.prepare(`
        INSERT INTO leaderboard_cache (period, slack_user_id, display_name, xp, rank, calculated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).bind('weekly', entry.slack_user_id, entry.display_name, entry.weekly_xp, index + 1)
    ),
  ]);

  console.log(`Leaderboard updated with ${weeklyStats.results.length} entries`);
}

/**
 * Check and reset streaks for inactive users
 */
async function handleCheckStreaks(env: Env): Promise<void> {
  console.log('Checking user streaks');

  // Reset streaks for users inactive for more than 24 hours
  const result = await env.DB.prepare(`
    UPDATE users 
    SET current_streak = 0, updated_at = CURRENT_TIMESTAMP
    WHERE last_activity_at < datetime('now', '-24 hours')
    AND current_streak > 0
  `).run();

  console.log(`Reset ${result.meta.changes} inactive streaks`);
}

// =============================================================================
// Helper Functions
// =============================================================================

function calculateStreakMultiplier(streak: number): number {
  // 1.0x base, +0.1x per day, max 2.0x at 10+ days
  return Math.min(2.0, 1.0 + streak * 0.1);
}

function getLevelTitle(level: number): string {
  const titles = [
    'Rookie',
    'Contributor',
    'Builder',
    'Specialist',
    'Expert',
    'Veteran',
    'Captain',
    'Legend',
    'All-Star',
    'FIRST Champion',
  ];
  return titles[Math.min(level - 1, titles.length - 1)];
}
