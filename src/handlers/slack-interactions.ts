/**
 * Slack Interactions Handler
 * 
 * Handles button clicks, modal submissions, and other interactive components
 */

import type { Context } from 'hono';
import type { Env, SlackInteractionPayload } from '../types';
import { respondToUrl, textBlock } from '../utils/slack-api';

/**
 * Main interactions handler
 */
export async function slackInteractionsHandler(
  c: Context<{ Bindings: Env }>,
  payload: SlackInteractionPayload
): Promise<Response> {
  console.log(`Interaction received: ${payload.type}`, JSON.stringify(payload));

  try {
    switch (payload.type) {
      case 'block_actions':
        await handleBlockActions(c, payload);
        break;

      case 'view_submission':
        await handleViewSubmission(c, payload);
        break;

      case 'shortcut':
        await handleShortcut(c, payload);
        break;

      default:
        console.log(`Unhandled interaction type: ${payload.type}`);
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    
    if (payload.response_url) {
      await respondToUrl(payload.response_url, '❌ Something went wrong. Please try again.');
    }
  }

  // Return 200 OK
  return c.json({ ok: true });
}

/**
 * Handle button clicks and other block actions
 */
async function handleBlockActions(
  c: Context<{ Bindings: Env }>,
  payload: SlackInteractionPayload
): Promise<void> {
  const actions = payload.actions || [];
  
  for (const action of actions) {
    switch (action.action_id) {
      case 'connect_atlassian':
        // Button click to connect Atlassian - URL is in the button, no action needed
        break;

      case 'add_comment':
        // Open modal to add comment
        await openCommentModal(c, payload.trigger_id, action.value || '');
        break;

      case 'promote_note':
        // Promote quick note to Jira ticket
        await promoteNoteToJira(c, payload.user.id, action.value || '', payload.response_url);
        break;

      case 'dismiss_note':
        // Dismiss a quick note
        await dismissNote(c, payload.user.id, action.value || '', payload.response_url);
        break;

      case 'join_leaderboard':
        // Opt into leaderboard
        await joinLeaderboard(c, payload.user.id, payload.response_url);
        break;

      case 'leave_leaderboard':
        // Opt out of leaderboard
        await leaveLeaderboard(c, payload.user.id, payload.response_url);
        break;

      default:
        console.log(`Unhandled action: ${action.action_id}`);
    }
  }
}

/**
 * Handle modal submissions
 */
async function handleViewSubmission(
  c: Context<{ Bindings: Env }>,
  payload: SlackInteractionPayload
): Promise<void> {
  const view = payload.view;
  if (!view) return;

  switch (view.callback_id) {
    case 'add_comment_modal':
      await submitComment(c, payload);
      break;

    case 'create_task_modal':
      await submitCreateTask(c, payload);
      break;

    default:
      console.log(`Unhandled view submission: ${view.callback_id}`);
  }
}

/**
 * Handle shortcuts (global and message shortcuts)
 */
async function handleShortcut(
  c: Context<{ Bindings: Env }>,
  payload: SlackInteractionPayload
): Promise<void> {
  // Shortcuts to be implemented
  console.log('Shortcut received:', payload);
}

// =============================================================================
// Action Handlers
// =============================================================================

/**
 * Open modal to add a comment to a Jira issue
 */
async function openCommentModal(
  c: Context<{ Bindings: Env }>,
  triggerId: string,
  issueKey: string
): Promise<void> {
  const response = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'add_comment_modal',
        private_metadata: issueKey,
        title: {
          type: 'plain_text',
          text: `Comment on ${issueKey}`,
        },
        submit: {
          type: 'plain_text',
          text: 'Add Comment',
        },
        close: {
          type: 'plain_text',
          text: 'Cancel',
        },
        blocks: [
          {
            type: 'input',
            block_id: 'comment_input',
            element: {
              type: 'plain_text_input',
              action_id: 'comment_text',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: 'Enter your comment...',
              },
            },
            label: {
              type: 'plain_text',
              text: 'Comment',
            },
          },
        ],
      },
    }),
  });

  const result = await response.json();
  if (!result.ok) {
    console.error('Failed to open modal:', result);
  }
}

/**
 * Submit a comment to Jira
 */
async function submitComment(
  c: Context<{ Bindings: Env }>,
  payload: SlackInteractionPayload
): Promise<void> {
  const view = payload.view;
  if (!view) return;

  const issueKey = view.private_metadata;
  const comment = view.state?.values?.comment_input?.comment_text?.value;

  if (!issueKey || !comment) {
    console.error('Missing issue key or comment');
    return;
  }

  // TODO: Add comment to Jira via API
  console.log(`Adding comment to ${issueKey}: ${comment}`);
  
  // Award XP for adding comment
  await c.env.TASKS_QUEUE.send({
    type: 'award_xp',
    userId: payload.user.id,
    amount: 5,
    reason: `Added comment to ${issueKey}`,
    sourceType: 'jira',
    sourceId: issueKey,
  });
}

/**
 * Promote a quick note to a Jira task
 */
async function promoteNoteToJira(
  c: Context<{ Bindings: Env }>,
  userId: string,
  noteId: string,
  responseUrl: string
): Promise<void> {
  // TODO: Implement note promotion to Jira
  await respondToUrl(responseUrl, '🎫 Creating Jira task...', {
    replace_original: true,
  });
}

/**
 * Dismiss a quick note
 */
async function dismissNote(
  c: Context<{ Bindings: Env }>,
  userId: string,
  noteId: string,
  responseUrl: string
): Promise<void> {
  // TODO: Mark note as dismissed in database
  await respondToUrl(responseUrl, '✅ Note dismissed', {
    delete_original: true,
  });
}

/**
 * Join the leaderboard
 */
async function joinLeaderboard(
  c: Context<{ Bindings: Env }>,
  userId: string,
  responseUrl: string
): Promise<void> {
  await c.env.DB.prepare(
    'UPDATE users SET leaderboard_opt_in = 1, updated_at = CURRENT_TIMESTAMP WHERE slack_user_id = ?'
  ).bind(userId).run();

  await respondToUrl(responseUrl, '🏆 You\'ve joined the leaderboard! Your stats will now be visible to teammates.', {
    replace_original: true,
  });
}

/**
 * Leave the leaderboard
 */
async function leaveLeaderboard(
  c: Context<{ Bindings: Env }>,
  userId: string,
  responseUrl: string
): Promise<void> {
  await c.env.DB.prepare(
    'UPDATE users SET leaderboard_opt_in = 0, updated_at = CURRENT_TIMESTAMP WHERE slack_user_id = ?'
  ).bind(userId).run();

  await respondToUrl(responseUrl, '👋 You\'ve left the leaderboard. Your stats are now private.', {
    replace_original: true,
  });
}

/**
 * Submit create task modal
 */
async function submitCreateTask(
  c: Context<{ Bindings: Env }>,
  payload: SlackInteractionPayload
): Promise<void> {
  // TODO: Create task in Jira
  console.log('Creating task from modal:', payload);
}
