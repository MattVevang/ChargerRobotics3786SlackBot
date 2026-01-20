/**
 * Atlassian OAuth Handler
 * 
 * Handles the OAuth 2.0 (3LO) callback from Atlassian
 */

import type { Context } from 'hono';
import type { Env } from '../types';

const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com';
const ATLASSIAN_API_URL = 'https://api.atlassian.com';

/**
 * Start OAuth flow - redirect user to Atlassian
 */
export async function atlassianOAuthStart(c: Context<{ Bindings: Env }>): Promise<Response> {
  const userId = c.req.query('user');
  
  if (!userId) {
    return c.text('Missing user parameter', 400);
  }

  // Generate state for CSRF protection
  const state = crypto.randomUUID();
  
  // Store state in database with expiration
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
  
  await c.env.DB.prepare(
    'INSERT INTO oauth_state (state, slack_user_id, provider, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(state, userId, 'atlassian', expiresAt).run();

  // Build authorization URL
  const workerUrl = c.req.url.split('/oauth')[0];
  const redirectUri = `${workerUrl}/oauth/atlassian/callback`;
  
  const scopes = [
    'read:jira-work',
    'write:jira-work',
    'read:jira-user',
    'read:confluence-content.all',
    'write:confluence-content.all',
    'read:confluence-user',
    'offline_access', // Required for refresh tokens
  ];

  const authUrl = new URL(`${ATLASSIAN_AUTH_URL}/authorize`);
  authUrl.searchParams.set('audience', 'api.atlassian.com');
  authUrl.searchParams.set('client_id', c.env.ATLASSIAN_CLIENT_ID);
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('prompt', 'consent');

  return c.redirect(authUrl.toString());
}

/**
 * OAuth callback - exchange code for tokens
 */
export async function atlassianOAuthCallback(c: Context<{ Bindings: Env }>): Promise<Response> {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  // Handle error from Atlassian
  if (error) {
    console.error('Atlassian OAuth error:', error, c.req.query('error_description'));
    return c.html(renderErrorPage('Authorization was denied or failed. Please try again.'));
  }

  if (!code || !state) {
    return c.html(renderErrorPage('Missing authorization code or state.'));
  }

  // Verify state and get user ID
  const stateResult = await c.env.DB.prepare(
    'SELECT slack_user_id FROM oauth_state WHERE state = ? AND provider = ? AND expires_at > datetime("now")'
  ).bind(state, 'atlassian').first<{ slack_user_id: string }>();

  if (!stateResult) {
    return c.html(renderErrorPage('Invalid or expired state. Please try again.'));
  }

  const userId = stateResult.slack_user_id;

  // Delete used state
  await c.env.DB.prepare('DELETE FROM oauth_state WHERE state = ?').bind(state).run();

  // Exchange code for tokens
  const workerUrl = c.req.url.split('/oauth')[0];
  const redirectUri = `${workerUrl}/oauth/atlassian/callback`;

  const tokenResponse = await fetch(`${ATLASSIAN_AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: c.env.ATLASSIAN_CLIENT_ID,
      client_secret: c.env.ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    console.error('Token exchange failed:', tokenResponse.status, errorBody);
    return c.html(renderErrorPage('Failed to exchange authorization code.'));
  }

  const tokens = await tokenResponse.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  // Get user's Atlassian account info
  const meResponse = await fetch(`${ATLASSIAN_API_URL}/me`, {
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
    },
  });

  if (!meResponse.ok) {
    console.error('Failed to get Atlassian user info');
    return c.html(renderErrorPage('Failed to get your Atlassian account info.'));
  }

  const atlassianUser = await meResponse.json() as {
    account_id: string;
    email: string;
    name: string;
  };

  // Encrypt tokens before storing
  const encryptedAccessToken = await encryptToken(tokens.access_token, c.env.ENCRYPTION_KEY);
  const encryptedRefreshToken = tokens.refresh_token 
    ? await encryptToken(tokens.refresh_token, c.env.ENCRYPTION_KEY)
    : null;
  
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Update user record with Atlassian info
  await c.env.DB.prepare(`
    UPDATE users SET 
      atlassian_account_id = ?,
      atlassian_email = ?,
      atlassian_access_token_encrypted = ?,
      atlassian_refresh_token_encrypted = ?,
      atlassian_token_expires_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE slack_user_id = ?
  `).bind(
    atlassianUser.account_id,
    atlassianUser.email,
    encryptedAccessToken,
    encryptedRefreshToken,
    tokenExpiresAt,
    userId
  ).run();

  // Award XP for connecting account
  await c.env.TASKS_QUEUE.send({
    type: 'award_xp',
    userId,
    amount: 25,
    reason: 'Connected Atlassian account',
    sourceType: 'onboarding',
  });

  // Check for badge eligibility
  await c.env.TASKS_QUEUE.send({
    type: 'check_badges',
    userId,
  });

  return c.html(renderSuccessPage(atlassianUser.name || atlassianUser.email));
}

/**
 * Encrypt a token for storage
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

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return bytesToBase64(combined);
}

/**
 * Decrypt a stored token
 */
export async function decryptToken(encrypted: string, keyHex: string): Promise<string> {
  const keyData = hexToBytes(keyHex);
  const combined = base64ToBytes(encrypted);
  
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return new TextDecoder().decode(decrypted);
}

// Helper functions
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

/**
 * Render success page HTML
 */
function renderSuccessPage(userName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Connected! - ChargerBot</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 48px;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 400px;
    }
    .emoji { font-size: 64px; margin-bottom: 16px; }
    h1 { color: #1a1a2e; margin: 0 0 8px; }
    p { color: #666; margin: 0 0 24px; }
    .name { color: #667eea; font-weight: 600; }
    .button {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
    }
    .button:hover { background: #5a6fd6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">🎉</div>
    <h1>Connected!</h1>
    <p>Your Atlassian account <span class="name">${userName}</span> is now linked to ChargerBot.</p>
    <p>You can close this window and return to Slack.</p>
    <a href="slack://open" class="button">Open Slack</a>
  </div>
</body>
</html>
  `;
}

/**
 * Render error page HTML
 */
function renderErrorPage(message: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Error - ChargerBot</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 48px;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      max-width: 400px;
    }
    .emoji { font-size: 64px; margin-bottom: 16px; }
    h1 { color: #e53935; margin: 0 0 8px; }
    p { color: #666; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">😕</div>
    <h1>Something went wrong</h1>
    <p>${message}</p>
  </div>
</body>
</html>
  `;
}
