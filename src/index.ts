/**
 * Charger Robotics 3786 Slack Bot
 * 
 * Main entry point for Cloudflare Worker
 * Handles Slack webhooks, OAuth callbacks, and async queue processing
 */

import { Hono } from 'hono';
import { slackEventsHandler } from './handlers/slack-events';
import { slackCommandsHandler } from './handlers/slack-commands';
import { slackInteractionsHandler } from './handlers/slack-interactions';
import { atlassianOAuthCallback } from './handlers/oauth-atlassian';
import { queueHandler } from './handlers/queue';
import { verifySlackRequest } from './utils/slack-verify';
import type { Env, QueueMessage } from './types';

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

// =============================================================================
// Middleware
// =============================================================================

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Charger Robotics 3786 Slack Bot',
    version: '0.1.0',
    status: 'ok',
    environment: c.env.ENVIRONMENT || 'development',
  });
});

// =============================================================================
// Slack Endpoints
// =============================================================================

// Slack Events API (mentions, DMs, etc.)
app.post('/slack/events', async (c) => {
  const body = await c.req.text();
  
  // Verify request signature
  const isValid = await verifySlackRequest(c.req.raw, body, c.env.SLACK_SIGNING_SECRET);
  if (!isValid) {
    console.error('Invalid Slack signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }
  
  const payload = JSON.parse(body);
  
  // Handle URL verification challenge (Slack sends this when configuring)
  if (payload.type === 'url_verification') {
    return c.json({ challenge: payload.challenge });
  }
  
  // Handle actual events
  return slackEventsHandler(c, payload);
});

// Slack Slash Commands
app.post('/slack/commands', async (c) => {
  const body = await c.req.text();
  
  // Verify request signature
  const isValid = await verifySlackRequest(c.req.raw, body, c.env.SLACK_SIGNING_SECRET);
  if (!isValid) {
    console.error('Invalid Slack signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }
  
  // Parse form data
  const formData = new URLSearchParams(body);
  const payload = Object.fromEntries(formData.entries());
  
  return slackCommandsHandler(c, payload);
});

// Slack Interactions (buttons, modals, etc.)
app.post('/slack/interactions', async (c) => {
  const body = await c.req.text();
  
  // Verify request signature
  const isValid = await verifySlackRequest(c.req.raw, body, c.env.SLACK_SIGNING_SECRET);
  if (!isValid) {
    console.error('Invalid Slack signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }
  
  // Parse payload (comes as form-encoded with payload key)
  const formData = new URLSearchParams(body);
  const payloadStr = formData.get('payload');
  if (!payloadStr) {
    return c.json({ error: 'Missing payload' }, 400);
  }
  
  const payload = JSON.parse(payloadStr);
  return slackInteractionsHandler(c, payload);
});

// =============================================================================
// OAuth Endpoints
// =============================================================================

// Atlassian OAuth callback
app.get('/oauth/atlassian/callback', atlassianOAuthCallback);

// =============================================================================
// Export
// =============================================================================

export default {
  // HTTP request handler
  fetch: app.fetch,
  
  // Queue consumer handler
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    await queueHandler(batch, env);
  },
};
