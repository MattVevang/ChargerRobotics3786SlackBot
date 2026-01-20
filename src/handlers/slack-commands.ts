/**
 * Slack Slash Commands Handler
 * 
 * Handles /tasks, /task, /note, /stats, /leaderboard, /help
 */

import type { Context } from 'hono';
import type { Env, SlackCommandPayload, SlackBlock } from '../types';
import { textBlock, headerBlock, dividerBlock, contextBlock } from '../utils/slack-api';
import { getOrCreateUser, getUserStats, updateUserActivity } from '../services/user-service';
import { getWeeklyLeaderboard } from '../services/gamification-service';
import { getUserTasks, getTaskDetails } from '../services/jira-service';
import { createQuickNote } from '../services/notes-service';

/**
 * Main slash command handler
 */
export async function slackCommandsHandler(
  c: Context<{ Bindings: Env }>,
  payload: SlackCommandPayload
): Promise<Response> {
  const { command, text, user_id, channel_id, response_url } = payload;

  console.log(`Command received: ${command} ${text} from ${user_id}`);

  // Get or create user and update activity
  await getOrCreateUser(c.env, user_id);
  await updateUserActivity(c.env, user_id);

  // Remove leading slash for processing
  const cmd = command.replace('/', '').toLowerCase();

  try {
    const response = await processCommand(c, cmd, text, user_id);
    
    return c.json({
      response_type: 'ephemeral',
      text: response.text,
      blocks: response.blocks,
    });
  } catch (error) {
    console.error(`Error processing command ${command}:`, error);
    
    return c.json({
      response_type: 'ephemeral',
      text: '❌ Something went wrong. Please try again.',
    });
  }
}

/**
 * Process a command and return response
 */
export async function processCommand(
  c: Context<{ Bindings: Env }>,
  command: string,
  text: string,
  userId: string
): Promise<{ text: string; blocks?: SlackBlock[] }> {
  switch (command) {
    case 'tasks':
      return handleTasksCommand(c, userId);
    
    case 'task':
      return handleTaskCommand(c, userId, text);
    
    case 'note':
      return handleNoteCommand(c, userId, text);
    
    case 'stats':
      return handleStatsCommand(c, userId);
    
    case 'leaderboard':
      return handleLeaderboardCommand(c, userId);
    
    case 'help':
    default:
      return handleHelpCommand();
  }
}

/**
 * /tasks - List user's assigned tasks
 */
async function handleTasksCommand(
  c: Context<{ Bindings: Env }>,
  userId: string
): Promise<{ text: string; blocks: SlackBlock[] }> {
  const user = await getOrCreateUser(c.env, userId);
  
  // Check if user has connected Atlassian
  if (!user.atlassian_account_id) {
    return {
      text: "You need to connect your Atlassian account first.",
      blocks: [
        headerBlock("🔗 Connect Atlassian"),
        textBlock("To see your Jira tasks, you need to connect your Atlassian account."),
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Connect Atlassian', emoji: true },
              style: 'primary',
              action_id: 'connect_atlassian',
              url: `https://${c.env.ENVIRONMENT === 'production' ? 'charger-bot' : 'charger-bot-dev'}.workers.dev/oauth/atlassian/start?user=${userId}`,
            },
          ],
        },
      ],
    };
  }

  // Fetch tasks from Jira
  const tasks = await getUserTasks(c.env, userId);
  
  if (!tasks || tasks.length === 0) {
    return {
      text: "You don't have any assigned tasks right now.",
      blocks: [
        headerBlock("📋 Your Tasks"),
        textBlock("🎉 You're all caught up! No tasks assigned to you right now."),
        contextBlock("Tasks assigned to you in Jira will show up here."),
      ],
    };
  }

  // Build task list blocks
  const taskBlocks: SlackBlock[] = [
    headerBlock(`📋 Your Tasks (${tasks.length})`),
  ];

  for (const task of tasks.slice(0, 10)) {
    const statusEmoji = getStatusEmoji(task.fields.status.name);
    const priorityEmoji = getPriorityEmoji(task.fields.priority?.name);
    
    taskBlocks.push(
      textBlock(
        `${statusEmoji} *<${task.self}|${task.key}>* ${task.fields.summary}\n` +
        `${priorityEmoji} ${task.fields.priority?.name || 'No priority'} • ${task.fields.status.name}`
      )
    );
  }

  if (tasks.length > 10) {
    taskBlocks.push(contextBlock(`...and ${tasks.length - 10} more tasks`));
  }

  taskBlocks.push(dividerBlock());
  taskBlocks.push(contextBlock("Use `/task ROBOT-123` to see details for a specific task"));

  return {
    text: `You have ${tasks.length} assigned tasks`,
    blocks: taskBlocks,
  };
}

/**
 * /task <id> - Get details for a specific task
 */
async function handleTaskCommand(
  c: Context<{ Bindings: Env }>,
  userId: string,
  taskId: string
): Promise<{ text: string; blocks: SlackBlock[] }> {
  if (!taskId || taskId.trim() === '') {
    return {
      text: "Please specify a task ID",
      blocks: [
        textBlock("❓ Please specify a task ID, like `/task ROBOT-123`"),
      ],
    };
  }

  const user = await getOrCreateUser(c.env, userId);
  
  if (!user.atlassian_account_id) {
    return {
      text: "Connect Atlassian first",
      blocks: [
        textBlock("🔗 Connect your Atlassian account first to view task details."),
      ],
    };
  }

  const task = await getTaskDetails(c.env, userId, taskId.toUpperCase());
  
  if (!task) {
    return {
      text: `Task ${taskId} not found`,
      blocks: [
        textBlock(`❌ Couldn't find task *${taskId.toUpperCase()}*`),
        contextBlock("Make sure the task ID is correct and you have access to it."),
      ],
    };
  }

  const statusEmoji = getStatusEmoji(task.fields.status.name);
  const priorityEmoji = getPriorityEmoji(task.fields.priority?.name);

  return {
    text: `${task.key}: ${task.fields.summary}`,
    blocks: [
      headerBlock(`${statusEmoji} ${task.key}`),
      textBlock(`*${task.fields.summary}*`),
      dividerBlock(),
      textBlock(
        `*Status:* ${task.fields.status.name}\n` +
        `*Priority:* ${priorityEmoji} ${task.fields.priority?.name || 'None'}\n` +
        `*Type:* ${task.fields.issuetype.name}\n` +
        `*Assignee:* ${task.fields.assignee?.displayName || 'Unassigned'}`
      ),
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '🔗 Open in Jira', emoji: true },
            url: task.self.replace('/rest/api/3/issue/', '/browse/'),
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '💬 Add Comment', emoji: true },
            action_id: 'add_comment',
            value: task.key,
          },
        ],
      },
    ],
  };
}

/**
 * /note <text> - Capture a quick note
 */
async function handleNoteCommand(
  c: Context<{ Bindings: Env }>,
  userId: string,
  noteText: string
): Promise<{ text: string; blocks: SlackBlock[] }> {
  if (!noteText || noteText.trim() === '') {
    return {
      text: "Please include your note",
      blocks: [
        textBlock("❓ Please include your note, like `/note We should use bigger wheels`"),
      ],
    };
  }

  await createQuickNote(c.env, userId, noteText);

  return {
    text: "Note saved!",
    blocks: [
      textBlock("📝 *Note saved!*"),
      textBlock(`> ${noteText}`),
      contextBlock("You can promote this to a Jira task later with `/notes`"),
    ],
  };
}

/**
 * /stats - Show user's gamification stats
 */
async function handleStatsCommand(
  c: Context<{ Bindings: Env }>,
  userId: string
): Promise<{ text: string; blocks: SlackBlock[] }> {
  const stats = await getUserStats(c.env, userId);
  
  const levelTitle = getLevelTitle(stats.level);
  const xpToNext = getXpForLevel(stats.level + 1) - stats.xp;
  const progressBar = createProgressBar(stats.xp, getXpForLevel(stats.level), getXpForLevel(stats.level + 1));

  const streakEmoji = stats.currentStreak >= 7 ? '🔥' : stats.currentStreak >= 3 ? '⚡' : '📅';

  return {
    text: `Level ${stats.level} ${levelTitle} - ${stats.xp} XP`,
    blocks: [
      headerBlock(`📊 Your Stats`),
      textBlock(
        `*Level ${stats.level}* - ${levelTitle}\n` +
        `*XP:* ${stats.xp.toLocaleString()} ${progressBar}\n` +
        `*Next level:* ${xpToNext.toLocaleString()} XP to go`
      ),
      dividerBlock(),
      textBlock(
        `${streakEmoji} *Current Streak:* ${stats.currentStreak} days\n` +
        `🏆 *Longest Streak:* ${stats.longestStreak} days\n` +
        `🎖️ *Badges:* ${stats.badgeCount}`
      ),
      contextBlock(`Keep up the great work! Complete tasks and docs to earn more XP.`),
    ],
  };
}

/**
 * /leaderboard - Show team leaderboard
 */
async function handleLeaderboardCommand(
  c: Context<{ Bindings: Env }>,
  userId: string
): Promise<{ text: string; blocks: SlackBlock[] }> {
  const leaderboard = await getWeeklyLeaderboard(c.env);
  
  if (!leaderboard || leaderboard.length === 0) {
    return {
      text: "Leaderboard is empty",
      blocks: [
        headerBlock("🏆 Weekly Leaderboard"),
        textBlock("No one has earned XP this week yet. Be the first!"),
      ],
    };
  }

  const blocks: SlackBlock[] = [
    headerBlock("🏆 Weekly Leaderboard"),
  ];

  const medals = ['🥇', '🥈', '🥉'];
  
  for (let i = 0; i < Math.min(leaderboard.length, 10); i++) {
    const entry = leaderboard[i];
    const medal = i < 3 ? medals[i] : `${i + 1}.`;
    const isCurrentUser = entry.slack_user_id === userId;
    const name = isCurrentUser ? `*${entry.display_name}* (you)` : entry.display_name;
    
    blocks.push(
      textBlock(`${medal} ${name} - ${entry.xp.toLocaleString()} XP`)
    );
  }

  // Show user's position if not in top 10
  const userIndex = leaderboard.findIndex(e => e.slack_user_id === userId);
  if (userIndex >= 10) {
    blocks.push(dividerBlock());
    blocks.push(
      textBlock(`*Your position:* #${userIndex + 1} with ${leaderboard[userIndex].xp.toLocaleString()} XP`)
    );
  }

  blocks.push(contextBlock("Leaderboard resets every Sunday at midnight"));

  return {
    text: "Weekly Leaderboard",
    blocks,
  };
}

/**
 * /help - Show available commands
 */
async function handleHelpCommand(): Promise<{ text: string; blocks: SlackBlock[] }> {
  return {
    text: "ChargerBot Help",
    blocks: [
      headerBlock("🤖 ChargerBot Help"),
      textBlock("I help you track tasks, earn XP, and stay on top of your robotics work!"),
      dividerBlock(),
      textBlock(
        "*📋 Task Commands*\n" +
        "`/tasks` - List your assigned work items\n" +
        "`/task ROBOT-123` - Get details for a specific task\n" +
        "`/note Your idea here` - Capture a quick thought"
      ),
      textBlock(
        "*🎮 Gamification*\n" +
        "`/stats` - View your XP, level, and streaks\n" +
        "`/leaderboard` - See the weekly leaderboard\n" +
        "`/badges` - View your earned badges"
      ),
      textBlock(
        "*💡 Tips*\n" +
        "• Complete tasks to earn XP\n" +
        "• Maintain daily activity for streak bonuses\n" +
        "• Write documentation for bonus XP\n" +
        "• Give teammates ⭐ reactions to share kudos"
      ),
      contextBlock("DM me anytime or @mention me in a channel!"),
    ],
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function getStatusEmoji(status: string): string {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('done') || statusLower.includes('complete')) return '✅';
  if (statusLower.includes('progress') || statusLower.includes('review')) return '🔄';
  if (statusLower.includes('block')) return '🚫';
  return '📋';
}

function getPriorityEmoji(priority?: string): string {
  if (!priority) return '➖';
  const priorityLower = priority.toLowerCase();
  if (priorityLower.includes('high') || priorityLower.includes('critical')) return '🔴';
  if (priorityLower.includes('medium')) return '🟡';
  if (priorityLower.includes('low')) return '🟢';
  return '➖';
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

function getXpForLevel(level: number): number {
  const thresholds = [0, 100, 350, 850, 1850, 3850, 7850, 15850, 30850, 60850];
  return thresholds[Math.min(level - 1, thresholds.length - 1)];
}

function createProgressBar(current: number, min: number, max: number): string {
  const progress = Math.min(1, Math.max(0, (current - min) / (max - min)));
  const filled = Math.round(progress * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}
