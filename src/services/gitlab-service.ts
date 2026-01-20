/**
 * GitLab Integration Service
 * 
 * Handles all GitLab API interactions
 */

import type { Env, GitLabMergeRequest, GitLabCommit, GitLabPipeline } from '../types';

/**
 * Get GitLab API token (group access token from secrets)
 */
function getGitLabToken(env: Env): string | null {
  return env.GITLAB_ACCESS_TOKEN || null;
}

/**
 * Get user's GitLab user ID from mapping
 */
async function getGitLabUserId(env: Env, slackUserId: string): Promise<number | null> {
  const user = await env.DB.prepare(
    'SELECT gitlab_user_id FROM users WHERE slack_user_id = ?'
  ).bind(slackUserId).first<{ gitlab_user_id: number | null }>();

  return user?.gitlab_user_id || null;
}

/**
 * Get user's merge requests
 */
export async function getUserMergeRequests(
  env: Env,
  slackUserId: string,
  state: 'opened' | 'merged' | 'all' = 'opened'
): Promise<GitLabMergeRequest[]> {
  const token = getGitLabToken(env);
  if (!token) return [];

  const gitlabUserId = await getGitLabUserId(env, slackUserId);
  if (!gitlabUserId) return [];

  const response = await fetch(
    `${env.GITLAB_URL}/api/v4/merge_requests?scope=all&author_id=${gitlabUserId}&state=${state}&per_page=20`,
    {
      headers: {
        'PRIVATE-TOKEN': token,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    console.error('Failed to fetch MRs:', response.status);
    return [];
  }

  const mrs = await response.json() as Array<{
    id: number;
    iid: number;
    title: string;
    description: string;
    state: string;
    web_url: string;
    source_branch: string;
    target_branch: string;
    author: { id: number; username: string; name: string };
    created_at: string;
    merged_at: string | null;
  }>;

  return mrs.map(mr => ({
    id: mr.id,
    iid: mr.iid,
    title: mr.title,
    description: mr.description,
    state: mr.state,
    webUrl: mr.web_url,
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
    author: {
      id: mr.author.id,
      username: mr.author.username,
      name: mr.author.name,
    },
    createdAt: mr.created_at,
    mergedAt: mr.merged_at,
  }));
}

/**
 * Get user's recent commits across all projects
 */
export async function getUserCommits(
  env: Env,
  slackUserId: string,
  days = 7
): Promise<GitLabCommit[]> {
  const token = getGitLabToken(env);
  if (!token) return [];

  const user = await env.DB.prepare(
    'SELECT gitlab_username FROM users WHERE slack_user_id = ?'
  ).bind(slackUserId).first<{ gitlab_username: string | null }>();

  if (!user?.gitlab_username) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Get user's projects first
  const gitlabUserId = await getGitLabUserId(env, slackUserId);
  const projectsResponse = await fetch(
    `${env.GITLAB_URL}/api/v4/users/${gitlabUserId}/projects?per_page=20`,
    {
      headers: {
        'PRIVATE-TOKEN': token,
        'Accept': 'application/json',
      },
    }
  );

  if (!projectsResponse.ok) return [];

  const projects = await projectsResponse.json() as Array<{ id: number; name: string }>;
  const allCommits: GitLabCommit[] = [];

  // Get commits from each project
  for (const project of projects.slice(0, 5)) {
    try {
      const commitsResponse = await fetch(
        `${env.GITLAB_URL}/api/v4/projects/${project.id}/repository/commits?author=${user.gitlab_username}&since=${since}&per_page=10`,
        {
          headers: {
            'PRIVATE-TOKEN': token,
            'Accept': 'application/json',
          },
        }
      );

      if (commitsResponse.ok) {
        const commits = await commitsResponse.json() as Array<{
          id: string;
          short_id: string;
          title: string;
          message: string;
          author_name: string;
          created_at: string;
          web_url: string;
        }>;

        allCommits.push(...commits.map(c => ({
          id: c.id,
          shortId: c.short_id,
          title: c.title,
          message: c.message,
          authorName: c.author_name,
          createdAt: c.created_at,
          webUrl: c.web_url,
          projectName: project.name,
        })));
      }
    } catch (error) {
      console.error(`Error fetching commits for project ${project.id}:`, error);
    }
  }

  // Sort by date and limit
  return allCommits
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);
}

/**
 * Get pipeline status for a project
 */
export async function getProjectPipelines(
  env: Env,
  projectId: number,
  limit = 5
): Promise<GitLabPipeline[]> {
  const token = getGitLabToken(env);
  if (!token) return [];

  const response = await fetch(
    `${env.GITLAB_URL}/api/v4/projects/${projectId}/pipelines?per_page=${limit}`,
    {
      headers: {
        'PRIVATE-TOKEN': token,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    console.error('Failed to fetch pipelines:', response.status);
    return [];
  }

  const pipelines = await response.json() as Array<{
    id: number;
    status: string;
    ref: string;
    web_url: string;
    created_at: string;
    updated_at: string;
  }>;

  return pipelines.map(p => ({
    id: p.id,
    status: p.status,
    ref: p.ref,
    webUrl: p.web_url,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}

/**
 * Get merge request details
 */
export async function getMergeRequestDetails(
  env: Env,
  projectId: number,
  mrIid: number
): Promise<GitLabMergeRequest | null> {
  const token = getGitLabToken(env);
  if (!token) return null;

  const response = await fetch(
    `${env.GITLAB_URL}/api/v4/projects/${projectId}/merge_requests/${mrIid}`,
    {
      headers: {
        'PRIVATE-TOKEN': token,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    console.error('Failed to fetch MR:', response.status);
    return null;
  }

  const mr = await response.json() as {
    id: number;
    iid: number;
    title: string;
    description: string;
    state: string;
    web_url: string;
    source_branch: string;
    target_branch: string;
    author: { id: number; username: string; name: string };
    created_at: string;
    merged_at: string | null;
  };

  return {
    id: mr.id,
    iid: mr.iid,
    title: mr.title,
    description: mr.description,
    state: mr.state,
    webUrl: mr.web_url,
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
    author: {
      id: mr.author.id,
      username: mr.author.username,
      name: mr.author.name,
    },
    createdAt: mr.created_at,
    mergedAt: mr.merged_at,
  };
}

/**
 * Process GitLab webhook event
 */
export async function processWebhook(
  env: Env,
  event: string,
  payload: any
): Promise<void> {
  console.log(`Processing GitLab webhook: ${event}`);

  switch (event) {
    case 'Merge Request Hook':
      await handleMergeRequestEvent(env, payload);
      break;

    case 'Push Hook':
      await handlePushEvent(env, payload);
      break;

    case 'Pipeline Hook':
      await handlePipelineEvent(env, payload);
      break;

    default:
      console.log(`Unhandled GitLab event: ${event}`);
  }
}

/**
 * Handle merge request events
 */
async function handleMergeRequestEvent(env: Env, payload: any): Promise<void> {
  const { object_attributes: mr, user } = payload;

  // Find user by GitLab username
  const dbUser = await env.DB.prepare(
    'SELECT slack_user_id FROM users WHERE gitlab_username = ?'
  ).bind(user.username).first<{ slack_user_id: string }>();

  if (!dbUser) return;

  switch (mr.action) {
    case 'open':
      // Award XP for opening MR
      await env.TASKS_QUEUE.send({
        type: 'award_xp',
        userId: dbUser.slack_user_id,
        amount: 15,
        reason: `Opened MR: ${mr.title}`,
        sourceType: 'gitlab',
        sourceId: `mr-${mr.iid}`,
      });
      break;

    case 'merge':
      // Award XP for merged MR
      await env.TASKS_QUEUE.send({
        type: 'award_xp',
        userId: dbUser.slack_user_id,
        amount: 30,
        reason: `MR merged: ${mr.title}`,
        sourceType: 'gitlab',
        sourceId: `mr-merged-${mr.iid}`,
      });

      // Check badges
      await env.TASKS_QUEUE.send({
        type: 'check_badges',
        userId: dbUser.slack_user_id,
      });
      break;
  }
}

/**
 * Handle push events (commits)
 */
async function handlePushEvent(env: Env, payload: any): Promise<void> {
  const { user_username, commits } = payload;

  if (!commits || commits.length === 0) return;

  // Find user by GitLab username
  const dbUser = await env.DB.prepare(
    'SELECT slack_user_id FROM users WHERE gitlab_username = ?'
  ).bind(user_username).first<{ slack_user_id: string }>();

  if (!dbUser) return;

  // Award XP for commits (batch, not individual)
  const commitCount = Math.min(commits.length, 10); // Cap at 10
  await env.TASKS_QUEUE.send({
    type: 'award_xp',
    userId: dbUser.slack_user_id,
    amount: 5 * commitCount,
    reason: `Pushed ${commitCount} commit${commitCount > 1 ? 's' : ''}`,
    sourceType: 'gitlab',
    sourceId: `push-${payload.checkout_sha}`,
  });
}

/**
 * Handle pipeline events
 */
async function handlePipelineEvent(env: Env, payload: any): Promise<void> {
  const { object_attributes: pipeline, user } = payload;

  // Only notify on failure
  if (pipeline.status !== 'failed') return;

  // Find user by GitLab username
  const dbUser = await env.DB.prepare(
    'SELECT slack_user_id FROM users WHERE gitlab_username = ?'
  ).bind(user.username).first<{ slack_user_id: string }>();

  if (!dbUser) return;

  // Send notification about failed pipeline
  await env.TASKS_QUEUE.send({
    type: 'send_notification',
    userId: dbUser.slack_user_id,
    message: `⚠️ Pipeline failed on branch \`${pipeline.ref}\`\n<${pipeline.url}|View pipeline>`,
  });
}

/**
 * Map Slack user to GitLab user
 */
export async function linkGitLabAccount(
  env: Env,
  slackUserId: string,
  gitlabUsername: string
): Promise<{ success: boolean; error?: string }> {
  const token = getGitLabToken(env);
  if (!token) {
    return { success: false, error: 'GitLab integration not configured' };
  }

  // Look up GitLab user by username
  const response = await fetch(
    `${env.GITLAB_URL}/api/v4/users?username=${encodeURIComponent(gitlabUsername)}`,
    {
      headers: {
        'PRIVATE-TOKEN': token,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    return { success: false, error: 'Failed to look up GitLab user' };
  }

  const users = await response.json() as Array<{ id: number; username: string }>;

  if (users.length === 0) {
    return { success: false, error: `GitLab user "${gitlabUsername}" not found` };
  }

  const gitlabUser = users[0];

  // Update user record
  await env.DB.prepare(`
    UPDATE users 
    SET gitlab_user_id = ?, gitlab_username = ?, updated_at = CURRENT_TIMESTAMP
    WHERE slack_user_id = ?
  `).bind(gitlabUser.id, gitlabUser.username, slackUserId).run();

  // Award XP for linking account
  await env.TASKS_QUEUE.send({
    type: 'award_xp',
    userId: slackUserId,
    amount: 15,
    reason: 'Connected GitLab account',
    sourceType: 'onboarding',
  });

  return { success: true };
}
