/**
 * Jira Integration Service
 * 
 * Handles all Jira API interactions
 */

import type { Env, JiraIssue } from '../types';
import { decryptToken } from '../handlers/oauth-atlassian';

const JIRA_API_BASE = 'https://api.atlassian.com/ex/jira';

/**
 * Get user's access token, refreshing if needed
 */
async function getAccessToken(env: Env, slackUserId: string): Promise<string | null> {
  const user = await env.DB.prepare(`
    SELECT 
      atlassian_access_token_encrypted,
      atlassian_refresh_token_encrypted,
      atlassian_token_expires_at
    FROM users 
    WHERE slack_user_id = ?
  `).bind(slackUserId).first<{
    atlassian_access_token_encrypted: string | null;
    atlassian_refresh_token_encrypted: string | null;
    atlassian_token_expires_at: string | null;
  }>();

  if (!user?.atlassian_access_token_encrypted) {
    return null;
  }

  // Check if token is expired
  const expiresAt = user.atlassian_token_expires_at 
    ? new Date(user.atlassian_token_expires_at) 
    : new Date(0);
  
  const now = new Date();
  const bufferMinutes = 5;

  if (expiresAt.getTime() - now.getTime() < bufferMinutes * 60 * 1000) {
    // Token expired or expiring soon, refresh it
    if (user.atlassian_refresh_token_encrypted) {
      return await refreshAccessToken(env, slackUserId, user.atlassian_refresh_token_encrypted);
    }
    return null;
  }

  return await decryptToken(user.atlassian_access_token_encrypted, env.ENCRYPTION_KEY);
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(
  env: Env,
  slackUserId: string,
  encryptedRefreshToken: string
): Promise<string | null> {
  const refreshToken = await decryptToken(encryptedRefreshToken, env.ENCRYPTION_KEY);

  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: env.ATLASSIAN_CLIENT_ID,
      client_secret: env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    console.error('Failed to refresh token:', await response.text());
    return null;
  }

  const tokens = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  // Re-encrypt and store new tokens
  const encryptedAccessToken = await encryptToken(tokens.access_token, env.ENCRYPTION_KEY);
  const newEncryptedRefresh = tokens.refresh_token 
    ? await encryptToken(tokens.refresh_token, env.ENCRYPTION_KEY)
    : encryptedRefreshToken;
  
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await env.DB.prepare(`
    UPDATE users SET
      atlassian_access_token_encrypted = ?,
      atlassian_refresh_token_encrypted = ?,
      atlassian_token_expires_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE slack_user_id = ?
  `).bind(encryptedAccessToken, newEncryptedRefresh, expiresAt, slackUserId).run();

  return tokens.access_token;
}

/**
 * Encrypt a token for storage (duplicated here to avoid circular import)
 */
async function encryptToken(token: string, keyHex: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = hexToBytes(keyHex);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(token)
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Get the user's Atlassian cloud ID
 */
async function getCloudId(accessToken: string): Promise<string | null> {
  const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('Failed to get accessible resources');
    return null;
  }

  const resources = await response.json() as Array<{ id: string; name: string }>;
  
  // Return the first Jira site (teams typically have one)
  return resources[0]?.id || null;
}

/**
 * Get user's assigned tasks
 */
export async function getUserTasks(env: Env, slackUserId: string): Promise<JiraIssue[]> {
  const accessToken = await getAccessToken(env, slackUserId);
  if (!accessToken) return [];

  const cloudId = await getCloudId(accessToken);
  if (!cloudId) return [];

  // JQL to get assigned issues, ordered by priority
  const jql = encodeURIComponent(
    'assignee = currentUser() AND resolution = Unresolved ORDER BY priority DESC, updated DESC'
  );

  const response = await fetch(
    `${JIRA_API_BASE}/${cloudId}/rest/api/3/search?jql=${jql}&maxResults=20&fields=summary,status,priority,issuetype,assignee`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    console.error('Failed to fetch tasks:', response.status);
    return [];
  }

  const data = await response.json() as { issues: JiraIssue[] };
  return data.issues || [];
}

/**
 * Get details for a specific task
 */
export async function getTaskDetails(
  env: Env,
  slackUserId: string,
  issueKey: string
): Promise<JiraIssue | null> {
  const accessToken = await getAccessToken(env, slackUserId);
  if (!accessToken) return null;

  const cloudId = await getCloudId(accessToken);
  if (!cloudId) return null;

  const response = await fetch(
    `${JIRA_API_BASE}/${cloudId}/rest/api/3/issue/${issueKey}?fields=summary,status,priority,issuetype,assignee,description,reporter,created,updated`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    console.error('Failed to fetch task:', response.status);
    return null;
  }

  return await response.json() as JiraIssue;
}

/**
 * Add a comment to an issue
 */
export async function addComment(
  env: Env,
  slackUserId: string,
  issueKey: string,
  comment: string
): Promise<boolean> {
  const accessToken = await getAccessToken(env, slackUserId);
  if (!accessToken) return false;

  const cloudId = await getCloudId(accessToken);
  if (!cloudId) return false;

  const response = await fetch(
    `${JIRA_API_BASE}/${cloudId}/rest/api/3/issue/${issueKey}/comment`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: comment },
              ],
            },
          ],
        },
      }),
    }
  );

  if (!response.ok) {
    console.error('Failed to add comment:', response.status);
    return false;
  }

  // Award XP for adding comment
  await env.TASKS_QUEUE.send({
    type: 'award_xp',
    userId: slackUserId,
    amount: 5,
    reason: `Added comment to ${issueKey}`,
    sourceType: 'jira',
    sourceId: `comment-${issueKey}`,
  });

  return true;
}

/**
 * Create a new Jira issue
 */
export async function createIssue(
  env: Env,
  slackUserId: string,
  projectKey: string,
  summary: string,
  description?: string,
  issueType = 'Task'
): Promise<JiraIssue | null> {
  const accessToken = await getAccessToken(env, slackUserId);
  if (!accessToken) return null;

  const cloudId = await getCloudId(accessToken);
  if (!cloudId) return null;

  const body: any = {
    fields: {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType },
    },
  };

  if (description) {
    body.fields.description = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: description }],
        },
      ],
    };
  }

  const response = await fetch(
    `${JIRA_API_BASE}/${cloudId}/rest/api/3/issue`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    console.error('Failed to create issue:', response.status, await response.text());
    return null;
  }

  const result = await response.json() as { key: string; id: string };

  // Award XP for creating issue
  await env.TASKS_QUEUE.send({
    type: 'award_xp',
    userId: slackUserId,
    amount: 10,
    reason: `Created issue ${result.key}`,
    sourceType: 'jira',
    sourceId: result.key,
  });

  // Fetch and return the full issue
  return await getTaskDetails(env, slackUserId, result.key);
}

/**
 * Sync user's tasks (for scheduled updates)
 */
export async function syncUserTasks(env: Env, slackUserId: string): Promise<void> {
  // This could be expanded to:
  // 1. Check for newly completed tasks and award XP
  // 2. Send reminders for overdue tasks
  // 3. Update local cache
  
  console.log(`Syncing tasks for ${slackUserId}`);
  
  // Get current tasks
  const tasks = await getUserTasks(env, slackUserId);
  
  // Store task count in KV for quick access
  await env.SESSIONS.put(`tasks:${slackUserId}:count`, tasks.length.toString(), {
    expirationTtl: 3600, // 1 hour
  });
}

/**
 * Transition an issue to a new status
 */
export async function transitionIssue(
  env: Env,
  slackUserId: string,
  issueKey: string,
  transitionName: string
): Promise<boolean> {
  const accessToken = await getAccessToken(env, slackUserId);
  if (!accessToken) return false;

  const cloudId = await getCloudId(accessToken);
  if (!cloudId) return false;

  // First, get available transitions
  const transitionsResponse = await fetch(
    `${JIRA_API_BASE}/${cloudId}/rest/api/3/issue/${issueKey}/transitions`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!transitionsResponse.ok) {
    console.error('Failed to get transitions');
    return false;
  }

  const { transitions } = await transitionsResponse.json() as {
    transitions: Array<{ id: string; name: string }>;
  };

  const transition = transitions.find(
    t => t.name.toLowerCase() === transitionName.toLowerCase()
  );

  if (!transition) {
    console.error(`Transition "${transitionName}" not found`);
    return false;
  }

  // Perform the transition
  const response = await fetch(
    `${JIRA_API_BASE}/${cloudId}/rest/api/3/issue/${issueKey}/transitions`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transition: { id: transition.id },
      }),
    }
  );

  if (!response.ok) {
    console.error('Failed to transition issue:', response.status);
    return false;
  }

  // Award XP for completing if transitioning to Done
  if (transitionName.toLowerCase().includes('done')) {
    await env.TASKS_QUEUE.send({
      type: 'award_xp',
      userId: slackUserId,
      amount: 25,
      reason: `Completed task ${issueKey}`,
      sourceType: 'jira',
      sourceId: `complete-${issueKey}`,
    });

    await env.TASKS_QUEUE.send({
      type: 'check_badges',
      userId: slackUserId,
    });
  }

  return true;
}
