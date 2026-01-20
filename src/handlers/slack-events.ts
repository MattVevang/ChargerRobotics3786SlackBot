/**
 * Slack Events Handler
 * 
 * Handles events from Slack Events API (mentions, DMs, reactions, etc.)
 */

import type { Context } from 'hono';
import type { Env, SlackEventPayload, AwardXpMessage } from '../types';
import { postMessage, textBlock, headerBlock } from '../utils/slack-api';
import { getOrCreateUser, updateUserActivity } from '../services/user-service';
import { processCommand } from './slack-commands';

/**
 * Main event handler
 */
export async function slackEventsHandler(
  c: Context<{ Bindings: Env }>,
  payload: SlackEventPayload
): Promise<Response> {
  const { event } = payload;

  if (!event) {
    return c.json({ ok: true });
  }

  // Log the event for debugging
  console.log(`Received event: ${event.type}`, JSON.stringify(event));

  try {
    switch (event.type) {
      case 'app_mention':
        await handleAppMention(c, event);
        break;

      case 'message':
        // Only handle DMs (no subtype means a regular message)
        if (event.channel?.startsWith('D') && !event.hasOwnProperty('subtype')) {
          await handleDirectMessage(c, event);
        }
        break;

      case 'reaction_added':
        await handleReactionAdded(c, event);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error('Error handling event:', error);
  }

  // Always return 200 OK quickly to Slack
  return c.json({ ok: true });
}

/**
 * Handle @mentions of the bot
 */
async function handleAppMention(
  c: Context<{ Bindings: Env }>,
  event: { user?: string; channel?: string; text?: string; ts?: string }
): Promise<void> {
  const { user, channel, text, ts } = event;
  
  if (!user || !channel || !text) return;

  // Get or create user
  await getOrCreateUser(c.env, user);
  
  // Extract the command from the mention (remove the bot mention)
  const commandText = text.replace(/<@[A-Z0-9]+>/gi, '').trim();
  
  if (!commandText) {
    // Just mentioned without a command - send help
    await postMessage(c.env.SLACK_BOT_TOKEN, channel, "Hey! I'm ChargerBot 🤖", {
      blocks: [
        headerBlock("Hey! I'm ChargerBot 🤖"),
        textBlock("I can help you track tasks, earn XP, and stay on top of your robotics work!"),
        textBlock("Try these commands:\n• `/tasks` - See your assigned work\n• `/stats` - Check your XP and level\n• `/help` - Full command list"),
      ],
      thread_ts: ts,
    });
    return;
  }

  // Parse as a natural language command
  const response = await parseNaturalCommand(c, user, commandText);
  
  await postMessage(c.env.SLACK_BOT_TOKEN, channel, response.text, {
    blocks: response.blocks,
    thread_ts: ts,
  });
}

/**
 * Handle direct messages to the bot
 */
async function handleDirectMessage(
  c: Context<{ Bindings: Env }>,
  event: { user?: string; channel?: string; text?: string; ts?: string }
): Promise<void> {
  const { user, channel, text } = event;
  
  if (!user || !channel || !text) return;

  // Don't respond to bot's own messages
  if (event.hasOwnProperty('bot_id')) return;

  // Get or create user and update activity
  await getOrCreateUser(c.env, user);
  await updateUserActivity(c.env, user);
  
  // Parse the message as a command or natural language
  const response = await parseNaturalCommand(c, user, text);
  
  await postMessage(c.env.SLACK_BOT_TOKEN, channel, response.text, {
    blocks: response.blocks,
  });
}

/**
 * Handle reactions (for kudos system)
 */
async function handleReactionAdded(
  c: Context<{ Bindings: Env }>,
  event: { user?: string; reaction?: string; item_user?: string }
): Promise<void> {
  const { user, reaction, item_user } = event;
  
  if (!user || !reaction || !item_user) return;
  
  // Don't award for self-reactions
  if (user === item_user) return;

  // Check for kudos reactions (star, thumbsup, etc.)
  const kudosReactions = ['star', 'star2', 'thumbsup', '+1', 'fire', 'rocket', '100'];
  
  if (kudosReactions.includes(reaction)) {
    // Queue XP award for the person who received the reaction
    const message: AwardXpMessage = {
      type: 'award_xp',
      userId: item_user,
      amount: 5,
      reason: `Received ${reaction} reaction from teammate`,
      sourceType: 'kudos',
    };
    
    await c.env.TASKS_QUEUE.send(message);
  }
}

/**
 * Parse natural language into a command
 */
async function parseNaturalCommand(
  c: Context<{ Bindings: Env }>,
  userId: string,
  text: string
): Promise<{ text: string; blocks?: any[] }> {
  const lowerText = text.toLowerCase().trim();

  // Simple keyword matching (can be enhanced with NLP later)
  
  // Tasks
  if (lowerText.includes('my task') || lowerText.includes('my work') || 
      lowerText.includes('what do i') || lowerText.includes('assigned to me')) {
    return processCommand(c, 'tasks', '', userId);
  }
  
  // Stats
  if (lowerText.includes('my stats') || lowerText.includes('my xp') || 
      lowerText.includes('my level') || lowerText.includes('my points')) {
    return processCommand(c, 'stats', '', userId);
  }
  
  // Leaderboard
  if (lowerText.includes('leaderboard') || lowerText.includes('who is winning') ||
      lowerText.includes('top') || lowerText.includes('rankings')) {
    return processCommand(c, 'leaderboard', '', userId);
  }
  
  // Help
  if (lowerText.includes('help') || lowerText.includes('what can you do') ||
      lowerText === 'hi' || lowerText === 'hello' || lowerText === 'hey') {
    return processCommand(c, 'help', '', userId);
  }
  
  // Quick note
  if (lowerText.startsWith('note:') || lowerText.startsWith('remember:') ||
      lowerText.startsWith('idea:')) {
    const noteText = text.split(':').slice(1).join(':').trim();
    return processCommand(c, 'note', noteText, userId);
  }
  
  // Task lookup by ID
  const taskIdMatch = lowerText.match(/\b([A-Z]+-\d+)\b/i);
  if (taskIdMatch) {
    return processCommand(c, 'task', taskIdMatch[1].toUpperCase(), userId);
  }

  // Default: Didn't understand
  return {
    text: "I'm not sure what you mean. Try `/help` to see what I can do!",
    blocks: [
      textBlock("🤔 I'm not sure what you mean."),
      textBlock("Try one of these:\n• `/tasks` - See your assigned work\n• `/stats` - Check your XP\n• `/help` - Full command list\n\nOr mention a task ID like `ROBOT-123` to look it up!"),
    ],
  };
}
