/**
 * Confluence Integration Service
 * 
 * Handles all Confluence API interactions
 */

import type { Env, ConfluencePage } from '../types';
import { decryptToken } from '../handlers/oauth-atlassian';

const CONFLUENCE_API_BASE = 'https://api.atlassian.com/ex/confluence';

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

  // Check if token is expired (with 5 min buffer)
  const expiresAt = user.atlassian_token_expires_at 
    ? new Date(user.atlassian_token_expires_at) 
    : new Date(0);
  
  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    // Token needs refresh - handled by jira-service for now
    // TODO: Refactor to shared auth service
    return null;
  }

  return await decryptToken(user.atlassian_access_token_encrypted, env.ENCRYPTION_KEY);
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

  if (!response.ok) return null;

  const resources = await response.json() as Array<{ id: string; name: string }>;
  return resources[0]?.id || null;
}

/**
 * Search for Confluence pages
 */
export async function searchPages(
  env: Env,
  slackUserId: string,
  query: string,
  limit = 10
): Promise<ConfluencePage[]> {
  const accessToken = await getAccessToken(env, slackUserId);
  if (!accessToken) return [];

  const cloudId = await getCloudId(accessToken);
  if (!cloudId) return [];

  const cql = encodeURIComponent(`text ~ "${query}" OR title ~ "${query}"`);

  const response = await fetch(
    `${CONFLUENCE_API_BASE}/${cloudId}/wiki/rest/api/search?cql=${cql}&limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    console.error('Failed to search Confluence:', response.status);
    return [];
  }

  const data = await response.json() as {
    results: Array<{
      content: {
        id: string;
        title: string;
        type: string;
        status: string;
        _links: { webui: string };
      };
      excerpt: string;
    }>;
  };

  return data.results.map(r => ({
    id: r.content.id,
    title: r.content.title,
    type: r.content.type,
    status: r.content.status,
    webUrl: r.content._links.webui,
    excerpt: r.excerpt,
  }));
}

/**
 * Get a specific Confluence page
 */
export async function getPage(
  env: Env,
  slackUserId: string,
  pageId: string
): Promise<ConfluencePage | null> {
  const accessToken = await getAccessToken(env, slackUserId);
  if (!accessToken) return null;

  const cloudId = await getCloudId(accessToken);
  if (!cloudId) return null;

  const response = await fetch(
    `${CONFLUENCE_API_BASE}/${cloudId}/wiki/rest/api/content/${pageId}?expand=body.view,version,space`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    console.error('Failed to get page:', response.status);
    return null;
  }

  const page = await response.json() as {
    id: string;
    title: string;
    type: string;
    status: string;
    version: { number: number };
    space: { key: string; name: string };
    body: { view: { value: string } };
    _links: { webui: string; base: string };
  };

  return {
    id: page.id,
    title: page.title,
    type: page.type,
    status: page.status,
    version: page.version.number,
    spaceKey: page.space.key,
    spaceName: page.space.name,
    webUrl: `${page._links.base}${page._links.webui}`,
    bodyHtml: page.body.view.value,
  };
}

/**
 * Get recent pages updated by the user
 */
export async function getRecentUpdates(
  env: Env,
  slackUserId: string,
  limit = 10
): Promise<ConfluencePage[]> {
  const accessToken = await getAccessToken(env, slackUserId);
  if (!accessToken) return [];

  const cloudId = await getCloudId(accessToken);
  if (!cloudId) return [];

  // Get the user's Atlassian account ID
  const user = await env.DB.prepare(
    'SELECT atlassian_account_id FROM users WHERE slack_user_id = ?'
  ).bind(slackUserId).first<{ atlassian_account_id: string }>();

  if (!user?.atlassian_account_id) return [];

  const cql = encodeURIComponent(
    `contributor = "${user.atlassian_account_id}" ORDER BY lastmodified DESC`
  );

  const response = await fetch(
    `${CONFLUENCE_API_BASE}/${cloudId}/wiki/rest/api/search?cql=${cql}&limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    console.error('Failed to get recent updates:', response.status);
    return [];
  }

  const data = await response.json() as {
    results: Array<{
      content: {
        id: string;
        title: string;
        type: string;
        status: string;
        _links: { webui: string };
      };
      lastModified: string;
    }>;
  };

  return data.results.map(r => ({
    id: r.content.id,
    title: r.content.title,
    type: r.content.type,
    status: r.content.status,
    webUrl: r.content._links.webui,
    lastModified: r.lastModified,
  }));
}

/**
 * Create a new Confluence page
 */
export async function createPage(
  env: Env,
  slackUserId: string,
  spaceKey: string,
  title: string,
  content: string,
  parentPageId?: string
): Promise<ConfluencePage | null> {
  const accessToken = await getAccessToken(env, slackUserId);
  if (!accessToken) return null;

  const cloudId = await getCloudId(accessToken);
  if (!cloudId) return null;

  const body: any = {
    type: 'page',
    title,
    space: { key: spaceKey },
    body: {
      storage: {
        value: content,
        representation: 'storage',
      },
    },
  };

  if (parentPageId) {
    body.ancestors = [{ id: parentPageId }];
  }

  const response = await fetch(
    `${CONFLUENCE_API_BASE}/${cloudId}/wiki/rest/api/content`,
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
    console.error('Failed to create page:', response.status, await response.text());
    return null;
  }

  const page = await response.json() as {
    id: string;
    title: string;
    type: string;
    status: string;
    _links: { webui: string; base: string };
  };

  // Award XP for creating documentation
  await env.TASKS_QUEUE.send({
    type: 'award_xp',
    userId: slackUserId,
    amount: 20,
    reason: `Created Confluence page: ${title}`,
    sourceType: 'confluence',
    sourceId: page.id,
  });

  await env.TASKS_QUEUE.send({
    type: 'check_badges',
    userId: slackUserId,
  });

  return {
    id: page.id,
    title: page.title,
    type: page.type,
    status: page.status,
    webUrl: `${page._links.base}${page._links.webui}`,
  };
}

/**
 * Update an existing Confluence page
 */
export async function updatePage(
  env: Env,
  slackUserId: string,
  pageId: string,
  title: string,
  content: string,
  currentVersion: number
): Promise<ConfluencePage | null> {
  const accessToken = await getAccessToken(env, slackUserId);
  if (!accessToken) return null;

  const cloudId = await getCloudId(accessToken);
  if (!cloudId) return null;

  const response = await fetch(
    `${CONFLUENCE_API_BASE}/${cloudId}/wiki/rest/api/content/${pageId}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'page',
        title,
        version: { number: currentVersion + 1 },
        body: {
          storage: {
            value: content,
            representation: 'storage',
          },
        },
      }),
    }
  );

  if (!response.ok) {
    console.error('Failed to update page:', response.status);
    return null;
  }

  const page = await response.json() as {
    id: string;
    title: string;
    type: string;
    status: string;
    _links: { webui: string; base: string };
  };

  // Award XP for updating documentation
  await env.TASKS_QUEUE.send({
    type: 'award_xp',
    userId: slackUserId,
    amount: 10,
    reason: `Updated Confluence page: ${title}`,
    sourceType: 'confluence',
    sourceId: `update-${page.id}`,
  });

  return {
    id: page.id,
    title: page.title,
    type: page.type,
    status: page.status,
    webUrl: `${page._links.base}${page._links.webui}`,
  };
}

/**
 * Get available spaces
 */
export async function getSpaces(
  env: Env,
  slackUserId: string
): Promise<Array<{ key: string; name: string; type: string }>> {
  const accessToken = await getAccessToken(env, slackUserId);
  if (!accessToken) return [];

  const cloudId = await getCloudId(accessToken);
  if (!cloudId) return [];

  const response = await fetch(
    `${CONFLUENCE_API_BASE}/${cloudId}/wiki/rest/api/space?limit=50`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    console.error('Failed to get spaces:', response.status);
    return [];
  }

  const data = await response.json() as {
    results: Array<{ key: string; name: string; type: string }>;
  };

  return data.results;
}
