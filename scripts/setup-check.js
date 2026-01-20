#!/usr/bin/env node
/**
 * Setup Check Script
 * 
 * Validates that all prerequisites are met before proceeding with setup.
 * This script checks for required tools and provides clear next steps.
 * 
 * Run with: npm run setup:check
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI colors for terminal output
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
  step: (num, msg) => console.log(`${colors.bold}[${num}]${colors.reset} ${msg}`),
};

// Check results
const results = {
  passed: [],
  failed: [],
  warnings: [],
};

/**
 * Check if a command exists
 */
function commandExists(cmd) {
  try {
    execSync(`where ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    try {
      execSync(`which ${cmd}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Get command version
 */
function getVersion(cmd, versionFlag = '--version') {
  try {
    const output = execSync(`${cmd} ${versionFlag}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return output.trim().split('\n')[0];
  } catch {
    return null;
  }
}

/**
 * Check Node.js version
 */
function checkNode() {
  log.header('Checking Node.js');
  
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  
  if (major >= 18) {
    log.success(`Node.js ${version} (required: >= 18.0.0)`);
    results.passed.push('Node.js');
    return true;
  } else {
    log.error(`Node.js ${version} is too old (required: >= 18.0.0)`);
    log.info('Install from: https://nodejs.org/');
    results.failed.push('Node.js');
    return false;
  }
}

/**
 * Check npm
 */
function checkNpm() {
  const version = getVersion('npm');
  if (version) {
    log.success(`npm ${version}`);
    results.passed.push('npm');
    return true;
  } else {
    log.error('npm not found');
    results.failed.push('npm');
    return false;
  }
}

/**
 * Check Wrangler CLI
 */
function checkWrangler() {
  log.header('Checking Cloudflare Wrangler');
  
  const version = getVersion('wrangler');
  if (version) {
    log.success(`Wrangler ${version}`);
    results.passed.push('Wrangler');
    return true;
  } else {
    log.warn('Wrangler not found globally (will use local version)');
    log.info('To install globally: npm install -g wrangler');
    results.warnings.push('Wrangler (global)');
    return true; // Not a hard requirement
  }
}

/**
 * Check Cloudflare authentication
 */
function checkCloudflareAuth() {
  try {
    execSync('npx wrangler whoami', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    log.success('Cloudflare authenticated');
    results.passed.push('Cloudflare Auth');
    return true;
  } catch {
    log.warn('Not logged in to Cloudflare');
    log.info('Run: npx wrangler login');
    results.warnings.push('Cloudflare Auth');
    return false;
  }
}

/**
 * Check Git
 */
function checkGit() {
  log.header('Checking Git');
  
  const version = getVersion('git');
  if (version) {
    log.success(`Git ${version}`);
    results.passed.push('Git');
    return true;
  } else {
    log.warn('Git not found (optional but recommended)');
    results.warnings.push('Git');
    return true;
  }
}

/**
 * Check if wrangler.toml has been configured
 */
function checkWranglerConfig() {
  log.header('Checking Configuration Files');
  
  const wranglerPath = path.join(process.cwd(), 'wrangler.toml');
  
  if (!fs.existsSync(wranglerPath)) {
    log.error('wrangler.toml not found');
    results.failed.push('wrangler.toml');
    return false;
  }
  
  const content = fs.readFileSync(wranglerPath, 'utf8');
  
  if (content.includes('YOUR_KV_NAMESPACE_ID_HERE')) {
    log.warn('wrangler.toml has placeholder values - run setup:cloudflare to configure');
    results.warnings.push('wrangler.toml configuration');
    return false;
  } else {
    log.success('wrangler.toml configured');
    results.passed.push('wrangler.toml');
    return true;
  }
}

/**
 * Check required files exist
 */
function checkRequiredFiles() {
  const files = [
    'package.json',
    'tsconfig.json',
    'migrations/001_initial_schema.sql',
  ];
  
  for (const file of files) {
    if (fs.existsSync(path.join(process.cwd(), file))) {
      log.success(`${file} exists`);
      results.passed.push(file);
    } else {
      log.error(`${file} missing`);
      results.failed.push(file);
    }
  }
}

/**
 * Print summary
 */
function printSummary() {
  log.header('Summary');
  
  console.log(`${colors.green}Passed:${colors.reset} ${results.passed.length}`);
  console.log(`${colors.yellow}Warnings:${colors.reset} ${results.warnings.length}`);
  console.log(`${colors.red}Failed:${colors.reset} ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    log.header('Required Actions');
    results.failed.forEach((item, i) => {
      log.step(i + 1, `Fix: ${item}`);
    });
  }
  
  if (results.warnings.length > 0 && results.failed.length === 0) {
    log.header('Recommended Actions');
    results.warnings.forEach((item, i) => {
      log.step(i + 1, `Consider: ${item}`);
    });
  }
  
  if (results.failed.length === 0) {
    log.header('Next Steps');
    console.log(`
1. If not logged in to Cloudflare:
   ${colors.cyan}npx wrangler login${colors.reset}

2. Create Cloudflare resources (KV, D1, Queues):
   ${colors.cyan}npm run setup:cloudflare${colors.reset}

3. Update wrangler.toml with the IDs from step 2

4. Set up secrets (Slack, Atlassian, GitLab):
   ${colors.cyan}npm run setup:secrets${colors.reset}

5. Run database migrations:
   ${colors.cyan}npm run db:migrate:local${colors.reset}

6. Start development:
   ${colors.cyan}npm run dev${colors.reset}

For detailed instructions, see: ${colors.cyan}docs/SETUP.md${colors.reset}
`);
    return 0;
  } else {
    return 1;
  }
}

// Main
console.log(`
${colors.bold}╔════════════════════════════════════════════════════════════╗
║     Charger Robotics 3786 Slack Bot - Setup Checker         ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
`);

checkNode();
checkNpm();
checkWrangler();
checkCloudflareAuth();
checkGit();
checkRequiredFiles();
checkWranglerConfig();

process.exit(printSummary());
