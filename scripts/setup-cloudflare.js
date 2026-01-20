#!/usr/bin/env node
/**
 * Cloudflare Resources Setup Script
 * 
 * Creates KV namespaces, D1 databases, and Queues for the bot.
 * Outputs the IDs needed to configure wrangler.toml.
 * 
 * PREREQUISITE: Must be logged in to Cloudflare (npx wrangler login)
 * 
 * Run with: npm run setup:cloudflare
 */

const { execSync } = require('child_process');
const readline = require('readline');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`),
  cmd: (msg) => console.log(`${colors.cyan}> ${msg}${colors.reset}`),
  output: (msg) => console.log(`  ${msg}`),
};

// Store created resource IDs
const resources = {
  kv: { dev: null, staging: null, production: null },
  d1: { dev: null, staging: null, production: null },
  queues: { dev: null, staging: null, production: null },
};

/**
 * Execute a wrangler command and return output
 */
function wrangler(args, silent = false) {
  const cmd = `npx wrangler ${args}`;
  if (!silent) log.cmd(cmd);
  
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { success: true, output: output.trim() };
  } catch (error) {
    return { success: false, output: error.stderr || error.message };
  }
}

/**
 * Parse KV namespace ID from wrangler output
 */
function parseKvId(output) {
  // Output format: "🌀 Created namespace "name" with id "xxx-xxx-xxx""
  const match = output.match(/id "([a-f0-9-]+)"/i) || output.match(/id:\s*([a-f0-9-]+)/i);
  return match ? match[1] : null;
}

/**
 * Parse D1 database ID from wrangler output
 */
function parseD1Id(output) {
  // Output format: "✅ Successfully created DB 'name' ... database_id = xxx-xxx-xxx"
  const match = output.match(/database_id\s*=\s*([a-f0-9-]+)/i) || output.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  return match ? match[1] : null;
}

/**
 * Create KV namespace
 */
function createKv(name) {
  log.info(`Creating KV namespace: ${name}`);
  
  const result = wrangler(`kv:namespace create "${name}"`);
  
  if (result.success) {
    const id = parseKvId(result.output);
    if (id) {
      log.success(`KV namespace created: ${id}`);
      log.output(result.output);
      return id;
    }
  }
  
  // Check if already exists
  if (result.output.includes('already exists') || result.output.includes('A namespace with this title already exists')) {
    log.warn(`KV namespace "${name}" already exists`);
    log.info('Listing existing namespaces to find ID...');
    
    const listResult = wrangler('kv:namespace list', true);
    if (listResult.success) {
      try {
        const namespaces = JSON.parse(listResult.output);
        const ns = namespaces.find(n => n.title === name || n.title.includes(name));
        if (ns) {
          log.success(`Found existing KV namespace: ${ns.id}`);
          return ns.id;
        }
      } catch {
        // JSON parse failed, try regex
        const match = listResult.output.match(new RegExp(`"id":\\s*"([a-f0-9-]+)"[^}]*"title":\\s*"[^"]*${name}`, 'i'));
        if (match) return match[1];
      }
    }
    
    log.error('Could not find existing namespace ID. Please check manually with: npx wrangler kv:namespace list');
    return 'EXISTING_NAMESPACE_CHECK_MANUALLY';
  }
  
  log.error(`Failed to create KV namespace: ${result.output}`);
  return null;
}

/**
 * Create D1 database
 */
function createD1(name) {
  log.info(`Creating D1 database: ${name}`);
  
  const result = wrangler(`d1 create "${name}"`);
  
  if (result.success) {
    const id = parseD1Id(result.output);
    if (id) {
      log.success(`D1 database created: ${id}`);
      log.output(result.output);
      return id;
    }
  }
  
  // Check if already exists
  if (result.output.includes('already exists')) {
    log.warn(`D1 database "${name}" already exists`);
    log.info('Listing existing databases to find ID...');
    
    const listResult = wrangler('d1 list', true);
    if (listResult.success) {
      const match = listResult.output.match(new RegExp(`([a-f0-9-]{36})[^\\n]*${name}`, 'i'));
      if (match) {
        log.success(`Found existing D1 database: ${match[1]}`);
        return match[1];
      }
    }
    
    log.error('Could not find existing database ID. Please check manually with: npx wrangler d1 list');
    return 'EXISTING_DATABASE_CHECK_MANUALLY';
  }
  
  log.error(`Failed to create D1 database: ${result.output}`);
  return null;
}

/**
 * Create Queue
 */
function createQueue(name) {
  log.info(`Creating Queue: ${name}`);
  
  const result = wrangler(`queues create "${name}"`);
  
  if (result.success) {
    log.success(`Queue created: ${name}`);
    return name;
  }
  
  if (result.output.includes('already exists')) {
    log.warn(`Queue "${name}" already exists`);
    return name;
  }
  
  // Queues might not be available on free plan
  if (result.output.includes('not available') || result.output.includes('upgrade')) {
    log.warn(`Queues require Cloudflare paid plan. Skipping queue creation.`);
    log.info('The bot will work without queues but may have slower response times for heavy operations.');
    return 'REQUIRES_PAID_PLAN';
  }
  
  log.error(`Failed to create queue: ${result.output}`);
  return null;
}

/**
 * Generate wrangler.toml snippet with actual IDs
 */
function generateConfig() {
  log.header('Configuration Snippet for wrangler.toml');
  
  console.log(`
${colors.yellow}# Copy these values into your wrangler.toml${colors.reset}

# Development environment
[[kv_namespaces]]
binding = "SESSIONS"
id = "${resources.kv.dev || 'YOUR_KV_ID'}"
preview_id = "${resources.kv.dev || 'YOUR_KV_PREVIEW_ID'}"

[[d1_databases]]
binding = "DB"
database_name = "charger-bot-dev"
database_id = "${resources.d1.dev || 'YOUR_D1_ID'}"

[[queues.producers]]
binding = "TASKS_QUEUE"
queue = "${resources.queues.dev || 'charger-bot-tasks-dev'}"

# Staging environment (in [env.staging] section)
[[env.staging.kv_namespaces]]
binding = "SESSIONS"
id = "${resources.kv.staging || 'YOUR_STAGING_KV_ID'}"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "charger-bot-staging"
database_id = "${resources.d1.staging || 'YOUR_STAGING_D1_ID'}"

# Production environment (in [env.production] section)
[[env.production.kv_namespaces]]
binding = "SESSIONS"
id = "${resources.kv.production || 'YOUR_PRODUCTION_KV_ID'}"

[[env.production.d1_databases]]
binding = "DB"
database_name = "charger-bot-production"
database_id = "${resources.d1.production || 'YOUR_PRODUCTION_D1_ID'}"
`);
}

/**
 * Main setup flow
 */
async function main() {
  console.log(`
${colors.bold}╔════════════════════════════════════════════════════════════╗
║    Charger Robotics 3786 - Cloudflare Resources Setup       ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
`);

  // Check authentication
  log.header('Step 1: Verifying Cloudflare Authentication');
  const whoami = wrangler('whoami', true);
  if (!whoami.success || whoami.output.includes('not authenticated')) {
    log.error('Not logged in to Cloudflare');
    log.info('Please run: npx wrangler login');
    process.exit(1);
  }
  log.success('Authenticated with Cloudflare');
  log.output(whoami.output.split('\n')[0]);

  // Create development resources
  log.header('Step 2: Creating Development Resources');
  resources.kv.dev = createKv('charger-bot-sessions-dev');
  resources.d1.dev = createD1('charger-bot-dev');
  resources.queues.dev = createQueue('charger-bot-tasks-dev');

  // Ask about staging/production
  log.header('Step 3: Additional Environments');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  const createStaging = await question(`${colors.yellow}Create staging environment resources? (y/N): ${colors.reset}`);
  
  if (createStaging.toLowerCase() === 'y') {
    log.header('Creating Staging Resources');
    resources.kv.staging = createKv('charger-bot-sessions-staging');
    resources.d1.staging = createD1('charger-bot-staging');
    resources.queues.staging = createQueue('charger-bot-tasks-staging');
  }

  const createProduction = await question(`${colors.yellow}Create production environment resources? (y/N): ${colors.reset}`);
  
  if (createProduction.toLowerCase() === 'y') {
    log.header('Creating Production Resources');
    resources.kv.production = createKv('charger-bot-sessions-production');
    resources.d1.production = createD1('charger-bot-production');
    resources.queues.production = createQueue('charger-bot-tasks-production');
  }

  rl.close();

  // Output configuration
  generateConfig();

  // Next steps
  log.header('Next Steps');
  console.log(`
1. ${colors.bold}Update wrangler.toml${colors.reset}
   Copy the configuration snippet above into your wrangler.toml file,
   replacing the placeholder values.

2. ${colors.bold}Set up secrets${colors.reset}
   Run: ${colors.cyan}npm run setup:secrets${colors.reset}

3. ${colors.bold}Run database migrations${colors.reset}
   Run: ${colors.cyan}npm run db:migrate:local${colors.reset}

4. ${colors.bold}Start development${colors.reset}
   Run: ${colors.cyan}npm run dev${colors.reset}

For complete setup guide, see: ${colors.cyan}docs/SETUP.md${colors.reset}
`);
}

main().catch(console.error);
