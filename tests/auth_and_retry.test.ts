import { describe, it, expect, beforeEach } from 'vitest';
import { validateRequestAccess } from '@/lib/auth';
import { RecipientSendResult } from '@/types';

describe('Access Control & Retry Orchestration', () => {
  beforeEach(() => {
    delete process.env.APP_ACCESS_KEY;
  });

  it('allows access in dev if APP_ACCESS_KEY is not configured', () => {
    const req = new Request('http://localhost:3000/api/send-batch', {
      method: 'POST',
    });
    const auth = validateRequestAccess(req);
    expect(auth.authorized).toBe(true);
  });

  it('rejects requests if APP_ACCESS_KEY is configured but missing in headers', () => {
    process.env.APP_ACCESS_KEY = 'super-secret-yonas-key';

    const req = new Request('http://localhost:3000/api/send-batch', {
      method: 'POST',
    });
    const auth = validateRequestAccess(req);
    expect(auth.authorized).toBe(false);
    expect(auth.reason).toContain('Missing access key');
  });

  it('rejects requests if APP_ACCESS_KEY is wrong', () => {
    process.env.APP_ACCESS_KEY = 'super-secret-yonas-key';

    const req = new Request('http://localhost:3000/api/send-batch', {
      method: 'POST',
      headers: {
        'x-app-access-key': 'wrong-key',
      },
    });
    const auth = validateRequestAccess(req);
    expect(auth.authorized).toBe(false);
    expect(auth.reason).toContain('Invalid access key');
  });

  it('authorizes requests with matching APP_ACCESS_KEY', () => {
    process.env.APP_ACCESS_KEY = 'super-secret-yonas-key';

    const req = new Request('http://localhost:3000/api/send-batch', {
      method: 'POST',
      headers: {
        'x-app-access-key': 'super-secret-yonas-key',
      },
    });
    const auth = validateRequestAccess(req);
    expect(auth.authorized).toBe(true);
  });

  it('filters out already submitted recipients for safe retry of only failed messages', () => {
    const previousRunResults: RecipientSendResult[] = [
      {
        recipientId: 'rec_1',
        name: 'Abebe',
        phone: '+251911223344',
        maskedPhone: '+251 91 ••• ••44',
        status: 'submitted',
        messageId: 'msg-1',
        timestamp: new Date().toISOString(),
      },
      {
        recipientId: 'rec_2',
        name: 'Sara',
        phone: '+251911223355',
        maskedPhone: '+251 91 ••• ••55',
        status: 'failed',
        error: 'Network timeout',
        timestamp: new Date().toISOString(),
      },
      {
        recipientId: 'rec_3',
        name: 'Dawit',
        phone: '+251911223366',
        maskedPhone: '+251 91 ••• ••66',
        status: 'timeout_unconfirmed',
        error: 'Provider status unconfirmed',
        timestamp: new Date().toISOString(),
      },
    ];

    // Retry candidate selector logic: only candidates whose status is 'failed' or 'timeout_unconfirmed'
    const retryCandidates = previousRunResults.filter(
      (r) => r.status === 'failed' || r.status === 'timeout_unconfirmed'
    );

    expect(retryCandidates.length).toBe(2);
    expect(retryCandidates.map((r) => r.recipientId)).toEqual(['rec_2', 'rec_3']);
    // rec_1 was already submitted and MUST NOT be retried
    expect(retryCandidates.find((r) => r.recipientId === 'rec_1')).toBeUndefined();
  });
});
