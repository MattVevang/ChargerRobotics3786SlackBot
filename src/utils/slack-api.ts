/**
 * Slack API Client
 * 
 * Helper functions for making Slack API calls
 */

import type { SlackBlock } from '../types';

const SLACK_API_BASE = 'https://slack.com/api';

/**
 * Post a message to a Slack channel or DM
 */
export async function postMessage(
  token: string,
  channel: string,
  text: string,
  options?: {
    blocks?: SlackBlock[];
    thread_ts?: string;
    unfurl_links?: boolean;
  }
): Promise<boolean> {
  const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      text,
      blocks: options?.blocks,
      thread_ts: options?.thread_ts,
      unfurl_links: options?.unfurl_links ?? false,
    }),
  });

  const result = await response.json() as { ok: boolean; error?: string };
  
  if (!result.ok) {
    console.error('Slack postMessage error:', result.error);
    return false;
  }

  return true;
}

/**
 * Post an ephemeral message (only visible to one user)
 */
export async function postEphemeral(
  token: string,
  channel: string,
  user: string,
  text: string,
  blocks?: SlackBlock[]
): Promise<boolean> {
  const response = await fetch(`${SLACK_API_BASE}/chat.postEphemeral`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      user,
      text,
      blocks,
    }),
  });

  const result = await response.json() as { ok: boolean; error?: string };
  
  if (!result.ok) {
    console.error('Slack postEphemeral error:', result.error);
    return false;
  }

  return true;
}

/**
 * Get user info by Slack user ID
 */
export async function getUserInfo(
  token: string,
  userId: string
): Promise<{ id: string; name: string; email?: string; display_name?: string } | null> {
  const response = await fetch(`${SLACK_API_BASE}/users.info?user=${userId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const result = await response.json() as {
    ok: boolean;
    error?: string;
    user?: {
      id: string;
      name: string;
      profile?: { email?: string; display_name?: string };
    };
  };

  if (!result.ok || !result.user) {
    console.error('Slack users.info error:', result.error);
    return null;
  }

  return {
    id: result.user.id,
    name: result.user.name,
    email: result.user.profile?.email,
    display_name: result.user.profile?.display_name,
  };
}

/**
 * Open a DM channel with a user
 */
export async function openDM(token: string, userId: string): Promise<string | null> {
  const response = await fetch(`${SLACK_API_BASE}/conversations.open`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      users: userId,
    }),
  });

  const result = await response.json() as {
    ok: boolean;
    error?: string;
    channel?: { id: string };
  };

  if (!result.ok || !result.channel) {
    console.error('Slack conversations.open error:', result.error);
    return null;
  }

  return result.channel.id;
}

/**
 * Respond to a slash command or interaction via response_url
 */
export async function respondToUrl(
  responseUrl: string,
  text: string,
  options?: {
    blocks?: SlackBlock[];
    response_type?: 'in_channel' | 'ephemeral';
    replace_original?: boolean;
    delete_original?: boolean;
  }
): Promise<boolean> {
  const response = await fetch(responseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      blocks: options?.blocks,
      response_type: options?.response_type || 'ephemeral',
      replace_original: options?.replace_original,
      delete_original: options?.delete_original,
    }),
  });

  return response.ok;
}

/**
 * Build a simple text block
 */
export function textBlock(text: string, emoji = true): SlackBlock {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text,
      emoji,
    },
  };
}

/**
 * Build a header block
 */
export function headerBlock(text: string): SlackBlock {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text,
      emoji: true,
    },
  };
}

/**
 * Build a divider block
 */
export function dividerBlock(): SlackBlock {
  return { type: 'divider' };
}

/**
 * Build a context block (small text)
 */
export function contextBlock(text: string): SlackBlock {
  return {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text,
      },
    ],
  };
}
