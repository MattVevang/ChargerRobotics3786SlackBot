/**
 * Quick Notes Service
 * 
 * Handles temporary notes that can be promoted to Jira tasks
 */

import type { Env, QuickNote } from '../types';

/**
 * Create a new quick note
 */
export async function createQuickNote(
  env: Env,
  slackUserId: string,
  content: string,
  channelId?: string
): Promise<QuickNote> {
  const result = await env.DB.prepare(`
    INSERT INTO quick_notes (slack_user_id, content, channel_id, created_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    RETURNING id, slack_user_id, content, channel_id, promoted_to_jira_key, is_dismissed, created_at
  `).bind(slackUserId, content, channelId || null).first<QuickNote>();

  // Award XP for capturing a note
  await env.TASKS_QUEUE.send({
    type: 'award_xp',
    userId: slackUserId,
    amount: 3,
    reason: 'Captured a quick note',
    sourceType: 'note',
    sourceId: `note-${result!.id}`,
  });

  return result!;
}

/**
 * Get user's active (non-dismissed, non-promoted) notes
 */
export async function getActiveNotes(
  env: Env,
  slackUserId: string,
  limit = 20
): Promise<QuickNote[]> {
  const result = await env.DB.prepare(`
    SELECT id, slack_user_id, content, channel_id, promoted_to_jira_key, is_dismissed, created_at
    FROM quick_notes
    WHERE slack_user_id = ?
      AND is_dismissed = 0
      AND promoted_to_jira_key IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(slackUserId, limit).all<QuickNote>();

  return result.results || [];
}

/**
 * Get all notes (including dismissed/promoted) for a user
 */
export async function getAllNotes(
  env: Env,
  slackUserId: string,
  limit = 50
): Promise<QuickNote[]> {
  const result = await env.DB.prepare(`
    SELECT id, slack_user_id, content, channel_id, promoted_to_jira_key, is_dismissed, created_at
    FROM quick_notes
    WHERE slack_user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(slackUserId, limit).all<QuickNote>();

  return result.results || [];
}

/**
 * Get a specific note
 */
export async function getNote(
  env: Env,
  noteId: number,
  slackUserId: string
): Promise<QuickNote | null> {
  return env.DB.prepare(`
    SELECT id, slack_user_id, content, channel_id, promoted_to_jira_key, is_dismissed, created_at
    FROM quick_notes
    WHERE id = ? AND slack_user_id = ?
  `).bind(noteId, slackUserId).first<QuickNote>();
}

/**
 * Mark a note as promoted to Jira
 */
export async function markNotePromoted(
  env: Env,
  noteId: number,
  jiraKey: string
): Promise<void> {
  await env.DB.prepare(`
    UPDATE quick_notes
    SET promoted_to_jira_key = ?
    WHERE id = ?
  `).bind(jiraKey, noteId).run();
}

/**
 * Dismiss a note
 */
export async function dismissNote(
  env: Env,
  noteId: number,
  slackUserId: string
): Promise<boolean> {
  const result = await env.DB.prepare(`
    UPDATE quick_notes
    SET is_dismissed = 1
    WHERE id = ? AND slack_user_id = ?
  `).bind(noteId, slackUserId).run();

  return result.meta.changes > 0;
}

/**
 * Delete a note (hard delete)
 */
export async function deleteNote(
  env: Env,
  noteId: number,
  slackUserId: string
): Promise<boolean> {
  const result = await env.DB.prepare(`
    DELETE FROM quick_notes
    WHERE id = ? AND slack_user_id = ?
  `).bind(noteId, slackUserId).run();

  return result.meta.changes > 0;
}

/**
 * Get notes created in a specific channel
 */
export async function getChannelNotes(
  env: Env,
  channelId: string,
  limit = 20
): Promise<QuickNote[]> {
  const result = await env.DB.prepare(`
    SELECT id, slack_user_id, content, channel_id, promoted_to_jira_key, is_dismissed, created_at
    FROM quick_notes
    WHERE channel_id = ?
      AND is_dismissed = 0
      AND promoted_to_jira_key IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(channelId, limit).all<QuickNote>();

  return result.results || [];
}

/**
 * Search notes by content
 */
export async function searchNotes(
  env: Env,
  slackUserId: string,
  query: string,
  limit = 20
): Promise<QuickNote[]> {
  const result = await env.DB.prepare(`
    SELECT id, slack_user_id, content, channel_id, promoted_to_jira_key, is_dismissed, created_at
    FROM quick_notes
    WHERE slack_user_id = ?
      AND content LIKE ?
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(slackUserId, `%${query}%`, limit).all<QuickNote>();

  return result.results || [];
}

/**
 * Get count of active notes for a user
 */
export async function getActiveNoteCount(
  env: Env,
  slackUserId: string
): Promise<number> {
  const result = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM quick_notes
    WHERE slack_user_id = ?
      AND is_dismissed = 0
      AND promoted_to_jira_key IS NULL
  `).bind(slackUserId).first<{ count: number }>();

  return result?.count || 0;
}
