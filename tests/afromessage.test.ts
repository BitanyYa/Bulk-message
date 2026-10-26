import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AfroMessageClient } from '@/lib/afromessage';

describe('AfroMessage API Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fails if API token is missing', async () => {
    const client = new AfroMessageClient({ apiKey: '' });
    const res = await client.sendSms('+251911223344', 'Test');
    expect(res.success).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.error).toContain('AfroMessage API key is not configured');
  });

  it('handles successful message submission (HTTP 200 acknowledge: success)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        acknowledge: 'success',
        response: {
          status: 'Send in progress...',
          message_id: 'mock-msg-uuid-12345',
          message: 'Hello Abebe',
          to: '+251911223344',
        },
      }),
    });

    const client = new AfroMessageClient({ apiKey: 'valid-test-token' });
    const res = await client.sendSms('+251911223344', 'Hello Abebe');

    expect(res.success).toBe(true);
    expect(res.status).toBe('submitted');
    expect(res.messageId).toBe('mock-msg-uuid-12345');
    expect(res.rawStatus).toBe('Send in progress...');
  });

  it('handles provider authentication failure (HTTP 401/403)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const client = new AfroMessageClient({ apiKey: 'invalid-token' });
    const res = await client.sendSms('+251911223344', 'Test');

    expect(res.success).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.error).toContain('AfroMessage authorization failed');
  });

  it('handles provider rate limit (HTTP 429)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Too Many Requests' }),
    });

    const client = new AfroMessageClient({ apiKey: 'valid-token' });
    const res = await client.sendSms('+251911223344', 'Test');

    expect(res.success).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.error).toContain('rate limit reached');
  });

  it('handles provider validation error (acknowledge: error)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        acknowledge: 'error',
        response: {
          errors: ['Unable to send your message. Message content is empty.'],
        },
      }),
    });

    const client = new AfroMessageClient({ apiKey: 'valid-token' });
    const res = await client.sendSms('+251911223344', '');

    expect(res.success).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.error).toContain('Unable to send your message');
  });

  it('handles ambiguous timeouts without assuming failure was confirmed', async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));

    const client = new AfroMessageClient({ apiKey: 'valid-token' });
    const res = await client.sendSms('+251911223344', 'Test timeout', { timeoutMs: 100 });

    expect(res.success).toBe(false);
    expect(res.status).toBe('timeout_unconfirmed');
    expect(res.error).toContain('Provider status is unconfirmed');
  });

  it('fetches account balance successfully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        acknowledge: 'success',
        response: {
          balance: '450.50',
          estimatedMessages: '1280',
        },
      }),
    });

    const client = new AfroMessageClient({ apiKey: 'valid-token' });
    const balance = await client.getBalance();

    expect(balance).not.toBeNull();
    expect(balance?.balance).toBe('450.50');
    expect(balance?.estimatedMessages).toBe('1280');
  });
});
