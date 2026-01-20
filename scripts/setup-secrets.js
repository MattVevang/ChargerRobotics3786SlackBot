#!/usr/bin/env node
/**
 * Secrets Setup Script
 * 
 * Interactive wizard to configure all required secrets for the bot.
 * Guides users through obtaining each secret and sets them via wrangler.
 * 
 * PREREQUISITE: 
 * - Must be logged in to Cloudflare (npx wrangler login)
 * - Must have created Cloudflare resources (npm run setup:cloudflare)
 * 
 * Run with: npm run setup:secrets
 */

const { execSync } = require('child_process');
const readline = require('readline');
const crypto = require('crypto');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}═══ ${msg} ═══${colors.reset}\n`),
  step: (num, total, msg) => console.log(`${colors.magenta}[${num}/${total}]${colors.reset} ${colors.bold}${msg}${colors.reset}`),
  url: (msg) => console.log(`    ${colors.cyan}${colors.bold}→ ${msg}${colors.reset}`),
  hint: (msg) => console.log(`    ${colors.dim}${msg}${colors.reset}`),
};

const TOTAL_STEPS = 6;
let currentEnv = '';

/**
 * Set a secret via wrangler
 */
function setSecret(name, value, env = '') {
  const envFlag = env ? ` --env ${env}` : '';
  const cmd = `npx wrangler secret put ${name}${envFlag}`;
  
  try {
    execSync(cmd, { 
      input: value,
      encoding: 'utf8', 
      stdio: ['pipe', 'pipe', 'pipe'] 
    });
    return true;
  } catch (error) {
    log.error(`Failed to set secret ${name}: ${error.message}`);
    return false;
  }
}

/**
 * Create readline interface with hidden input for secrets
 */
function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

const question = (rl, prompt) => new Promise((resolve) => rl.question(prompt, resolve));

/**
 * Generate a random encryption key
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Main setup flow
 */
async function main() {
  console.log(`
${colors.bold}╔════════════════════════════════════════════════════════════════╗
║      Charger Robotics 3786 - Secrets Setup Wizard              ║
║                                                                 ║
║  This wizard will guide you through setting up all required     ║
║  API keys and secrets for the Slack bot.                        ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}

${colors.yellow}⚠ IMPORTANT: Keep all secrets secure and never commit them to git!${colors.reset}
${colors.yellow}  Store a copy in your team's password manager.${colors.reset}
`);

  const rl = createReadline();
  
  // Ask which environment to configure
  console.log(`Which environment do you want to configure?`);
  console.log(`  1. Development (default)`);
  console.log(`  2. Staging`);
  console.log(`  3. Production`);
  
  const envChoice = await question(rl, `\nSelect environment (1-3) [1]: `);
  
  switch (envChoice.trim()) {
    case '2':
      currentEnv = 'staging';
      break;
    case '3':
      currentEnv = 'production';
      break;
    default:
      currentEnv = '';
  }
  
  const envName = currentEnv || 'development';
  log.info(`Configuring secrets for: ${colors.bold}${envName}${colors.reset}\n`);

  // =========================================================================
  // STEP 1: Slack Signing Secret
  // =========================================================================
  log.header(`STEP 1/${TOTAL_STEPS}: Slack Signing Secret`);
  
  console.log(`The Slack Signing Secret is used to verify that incoming webhooks
are actually from Slack and not from a malicious source.

${colors.bold}How to obtain:${colors.reset}
1. Go to your Slack App settings:`);
  log.url('https://api.slack.com/apps');
  console.log(`
2. Select your app (or create one if you haven't yet)
3. In the sidebar, click "Basic Information"
4. Scroll to "App Credentials"
5. Copy the "Signing Secret"
`);

  const slackSigningSecret = await question(rl, `${colors.yellow}Enter Slack Signing Secret:${colors.reset} `);
  
  if (slackSigningSecret.trim()) {
    if (setSecret('SLACK_SIGNING_SECRET', slackSigningSecret.trim(), currentEnv)) {
      log.success('Slack Signing Secret set successfully');
    }
  } else {
    log.warn('Skipped Slack Signing Secret');
  }

  // =========================================================================
  // STEP 2: Slack Bot Token
  // =========================================================================
  log.header(`STEP 2/${TOTAL_STEPS}: Slack Bot Token`);
  
  console.log(`The Slack Bot Token allows the bot to send messages and interact
with your Slack workspace. It starts with "xoxb-".

${colors.bold}How to obtain:${colors.reset}
1. Go to your Slack App settings:`);
  log.url('https://api.slack.com/apps');
  console.log(`
2. Select your app
3. In the sidebar, click "OAuth & Permissions"
4. Copy the "Bot User OAuth Token" (starts with xoxb-)

${colors.bold}Required OAuth Scopes (add these if not already added):${colors.reset}
  • chat:write        - Send messages
  • commands          - Handle slash commands
  • users:read        - Get user information
  • users:read.email  - Get user emails (for identity mapping)
  • im:history        - Read DM history
  • im:write          - Send DMs
  • reactions:read    - See reactions (for kudos)
  • reactions:write   - Add reactions
`);

  const slackBotToken = await question(rl, `${colors.yellow}Enter Slack Bot Token (xoxb-...):${colors.reset} `);
  
  if (slackBotToken.trim()) {
    if (!slackBotToken.startsWith('xoxb-')) {
      log.warn('Token should start with "xoxb-" - are you sure this is correct?');
    }
    if (setSecret('SLACK_BOT_TOKEN', slackBotToken.trim(), currentEnv)) {
      log.success('Slack Bot Token set successfully');
    }
  } else {
    log.warn('Skipped Slack Bot Token');
  }

  // =========================================================================
  // STEP 3: Atlassian OAuth Credentials
  // =========================================================================
  log.header(`STEP 3/${TOTAL_STEPS}: Atlassian OAuth Credentials`);
  
  console.log(`Atlassian OAuth 2.0 (3LO) is used to access Jira and Confluence
on behalf of users. You need a Client ID and Client Secret.

${colors.bold}How to obtain:${colors.reset}
1. Go to Atlassian Developer Console:`);
  log.url('https://developer.atlassian.com/console/myapps/');
  console.log(`
2. Click "Create" → "OAuth 2.0 integration"
3. Give it a name (e.g., "Charger Robotics Slack Bot")
4. After creation, go to "Settings" to find Client ID
5. Go to "Authorization" → add callback URL:
   ${colors.cyan}https://YOUR_WORKER_URL/oauth/atlassian/callback${colors.reset}
6. Go to "Permissions" and add:
   • Jira API: read:jira-work, write:jira-work
   • Confluence API: read:confluence-content.all, write:confluence-content.all
7. Copy the Client ID and Client Secret

${colors.yellow}⚠ Use a team email (tech@chargerrobotics.org) for the Atlassian
  Developer account, not a personal email!${colors.reset}
`);

  const atlassianClientId = await question(rl, `${colors.yellow}Enter Atlassian Client ID:${colors.reset} `);
  
  if (atlassianClientId.trim()) {
    if (setSecret('ATLASSIAN_CLIENT_ID', atlassianClientId.trim(), currentEnv)) {
      log.success('Atlassian Client ID set successfully');
    }
  } else {
    log.warn('Skipped Atlassian Client ID');
  }

  const atlassianClientSecret = await question(rl, `${colors.yellow}Enter Atlassian Client Secret:${colors.reset} `);
  
  if (atlassianClientSecret.trim()) {
    if (setSecret('ATLASSIAN_CLIENT_SECRET', atlassianClientSecret.trim(), currentEnv)) {
      log.success('Atlassian Client Secret set successfully');
    }
  } else {
    log.warn('Skipped Atlassian Client Secret');
  }

  // =========================================================================
  // STEP 4: GitLab Access Token
  // =========================================================================
  log.header(`STEP 4/${TOTAL_STEPS}: GitLab Access Token`);
  
  console.log(`GitLab Access Token is used to read commits, merge requests,
and issues from your GitLab projects.

${colors.bold}Recommended: Group Access Token${colors.reset} (requires GitLab Premium)
This creates a bot user that isn't tied to any personal account.

${colors.bold}How to obtain (Group Access Token):${colors.reset}
1. Go to your GitLab group settings:`);
  log.url('https://gitlab.com/groups/YOUR_GROUP/-/settings/access_tokens');
  console.log(`
2. Click "Add new token"
3. Set:
   • Name: "Charger Robotics Slack Bot"
   • Expiration: 1 year (maximum)
   • Role: Reporter (or Developer if you need write access)
   • Scopes: read_api, read_repository
4. Copy the token (starts with "glpat-")

${colors.bold}Alternative: Project Access Token${colors.reset} (also requires Premium)
Use if you only need access to specific projects.

${colors.bold}Fallback: Personal Access Token${colors.reset} (Free tier, but tied to user)
1. Go to: User Settings → Access Tokens
2. Create token with read_api scope

${colors.yellow}⚠ If using Personal Access Token, use a dedicated "bot" account
  with a team email, not your personal account!${colors.reset}
`);

  const gitlabToken = await question(rl, `${colors.yellow}Enter GitLab Access Token:${colors.reset} `);
  
  if (gitlabToken.trim()) {
    if (setSecret('GITLAB_ACCESS_TOKEN', gitlabToken.trim(), currentEnv)) {
      log.success('GitLab Access Token set successfully');
    }
  } else {
    log.warn('Skipped GitLab Access Token');
  }

  // =========================================================================
  // STEP 5: Encryption Key
  // =========================================================================
  log.header(`STEP 5/${TOTAL_STEPS}: Encryption Key`);
  
  console.log(`The encryption key is used to encrypt OAuth tokens stored in the
database. This should be a 64-character hex string (32 bytes).

${colors.bold}You have two options:${colors.reset}
1. Generate a new random key (recommended)
2. Enter an existing key (if migrating or sharing across environments)
`);

  const generateNew = await question(rl, `${colors.yellow}Generate new encryption key? (Y/n):${colors.reset} `);
  
  let encryptionKey;
  if (generateNew.toLowerCase() !== 'n') {
    encryptionKey = generateEncryptionKey();
    console.log(`\n${colors.green}Generated key:${colors.reset} ${encryptionKey}`);
    console.log(`${colors.yellow}⚠ SAVE THIS KEY in your password manager!${colors.reset}`);
    console.log(`${colors.yellow}  If you lose it, users will need to re-authenticate.${colors.reset}\n`);
  } else {
    encryptionKey = await question(rl, `${colors.yellow}Enter encryption key (64 hex chars):${colors.reset} `);
  }
  
  if (encryptionKey && encryptionKey.trim().length === 64) {
    if (setSecret('ENCRYPTION_KEY', encryptionKey.trim(), currentEnv)) {
      log.success('Encryption Key set successfully');
    }
  } else if (encryptionKey) {
    log.error('Encryption key must be exactly 64 hex characters');
  } else {
    log.warn('Skipped Encryption Key');
  }

  // =========================================================================
  // STEP 6: Summary
  // =========================================================================
  log.header(`STEP 6/${TOTAL_STEPS}: Summary`);
  
  console.log(`${colors.bold}Secrets configured for: ${envName}${colors.reset}

You can verify secrets are set with:
  ${colors.cyan}npx wrangler secret list${currentEnv ? ` --env ${currentEnv}` : ''}${colors.reset}

${colors.bold}To update a secret later:${colors.reset}
  ${colors.cyan}npx wrangler secret put SECRET_NAME${currentEnv ? ` --env ${currentEnv}` : ''}${colors.reset}

${colors.bold}Required secrets checklist:${colors.reset}
  □ SLACK_SIGNING_SECRET
  □ SLACK_BOT_TOKEN
  □ ATLASSIAN_CLIENT_ID
  □ ATLASSIAN_CLIENT_SECRET
  □ GITLAB_ACCESS_TOKEN
  □ ENCRYPTION_KEY

${colors.bold}Next steps:${colors.reset}
1. Run database migrations:
   ${colors.cyan}npm run db:migrate:local${colors.reset}

2. Configure Slack App webhooks (see docs/SETUP.md Step 5)

3. Start development:
   ${colors.cyan}npm run dev${colors.reset}
`);

  rl.close();
}

main().catch((error) => {
  log.error(`Setup failed: ${error.message}`);
  process.exit(1);
});
