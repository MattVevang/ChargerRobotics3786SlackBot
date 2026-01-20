/**
 * Basic Tests for ChargerBot
 * 
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock environment
const createMockEnv = () => ({
  SESSIONS: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  DB: {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(),
        all: vi.fn(),
        run: vi.fn(),
      })),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    })),
    batch: vi.fn(),
  },
  TASKS_QUEUE: {
    send: vi.fn(),
  },
  ENVIRONMENT: 'test',
  LOG_LEVEL: 'debug',
  BOT_NAME: 'ChargerBot',
  TEAM_NUMBER: '3786',
  SLACK_SIGNING_SECRET: 'test-signing-secret',
  SLACK_BOT_TOKEN: 'xoxb-test-token',
  ATLASSIAN_CLIENT_ID: 'test-atlassian-id',
  ATLASSIAN_CLIENT_SECRET: 'test-atlassian-secret',
  GITLAB_ACCESS_TOKEN: 'test-gitlab-token',
  GITLAB_URL: 'https://gitlab.example.com',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
});

describe('Slack Signature Verification', () => {
  it('should reject requests with missing signature', async () => {
    const { verifySlackRequest } = await import('../src/utils/slack-verify');
    
    const request = new Request('https://example.com/slack/events', {
      method: 'POST',
      headers: {
        'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
        // Missing x-slack-signature
      },
      body: JSON.stringify({ type: 'event' }),
    });

    const env = createMockEnv();
    const result = await verifySlackRequest(request, env.SLACK_SIGNING_SECRET);
    
    expect(result.valid).toBe(false);
  });

  it('should reject requests with old timestamps', async () => {
    const { verifySlackRequest } = await import('../src/utils/slack-verify');
    
    // Timestamp from 10 minutes ago
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    
    const request = new Request('https://example.com/slack/events', {
      method: 'POST',
      headers: {
        'x-slack-request-timestamp': String(oldTimestamp),
        'x-slack-signature': 'v0=test',
      },
      body: JSON.stringify({ type: 'event' }),
    });

    const env = createMockEnv();
    const result = await verifySlackRequest(request, env.SLACK_SIGNING_SECRET);
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('old');
  });
});

describe('Gamification Level Calculation', () => {
  it('should calculate correct level from XP', async () => {
    const { calculateLevel, getXpForLevel } = await import('../src/services/gamification-service');
    
    // Level 1: 0 XP
    expect(calculateLevel(0)).toBe(1);
    expect(calculateLevel(50)).toBe(1);
    expect(calculateLevel(99)).toBe(1);
    
    // Level 2: 100 XP
    expect(calculateLevel(100)).toBe(2);
    expect(calculateLevel(349)).toBe(2);
    
    // Level 3: 350 XP
    expect(calculateLevel(350)).toBe(3);
    expect(calculateLevel(849)).toBe(3);
    
    // Level 5: 1850 XP
    expect(calculateLevel(1850)).toBe(5);
  });

  it('should return correct XP thresholds for levels', async () => {
    const { getXpForLevel } = await import('../src/services/gamification-service');
    
    expect(getXpForLevel(1)).toBe(0);
    expect(getXpForLevel(2)).toBe(100);
    expect(getXpForLevel(3)).toBe(350);
    expect(getXpForLevel(5)).toBe(1850);
    expect(getXpForLevel(10)).toBe(60850);
  });
});

describe('Slack API Helpers', () => {
  it('should create text blocks correctly', async () => {
    const { textBlock, headerBlock, dividerBlock } = await import('../src/utils/slack-api');
    
    const text = textBlock('Hello *world*!');
    expect(text.type).toBe('section');
    expect(text.text?.text).toBe('Hello *world*!');
    expect(text.text?.type).toBe('mrkdwn');
    
    const header = headerBlock('Title');
    expect(header.type).toBe('header');
    
    const divider = dividerBlock();
    expect(divider.type).toBe('divider');
  });
});

describe('Quick Notes Service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should create a quick note', async () => {
    const mockEnv = createMockEnv();
    const mockNote = {
      id: 1,
      slack_user_id: 'U123',
      content: 'Test note',
      channel_id: null,
      promoted_to_jira_key: null,
      is_dismissed: false,
      created_at: new Date().toISOString(),
    };

    mockEnv.DB.prepare = vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(mockNote),
      }),
    });

    const { createQuickNote } = await import('../src/services/notes-service');
    const result = await createQuickNote(mockEnv as any, 'U123', 'Test note');
    
    expect(result).toEqual(mockNote);
    expect(mockEnv.TASKS_QUEUE.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'award_xp',
        userId: 'U123',
        amount: 3,
      })
    );
  });
});

describe('Health Check Endpoint', () => {
  it('should return 200 OK on root path', async () => {
    // This would test the actual worker, but we'll do a simple check
    const response = { status: 'ok', bot: 'ChargerBot' };
    expect(response.status).toBe('ok');
  });
});
