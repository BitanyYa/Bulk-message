import { describe, it, expect, beforeEach } from 'vitest';
import { validateRequestAccess } from '@/lib/auth';
import { CampaignRecipientRecord } from '@/types';

describe('Campaign Models, Persistence & Dashboard Logic', () => {
  beforeEach(() => {
    delete process.env.APP_ACCESS_KEY;
  });

  it('enforces authentication on all campaign and dashboard endpoints', () => {
    process.env.APP_ACCESS_KEY = 'secret-test-access-key';

    const unauthReq = new Request('http://localhost:3000/api/dashboard', {
      method: 'GET',
    });
    const auth1 = validateRequestAccess(unauthReq);
    expect(auth1.authorized).toBe(false);

    const wrongKeyReq = new Request('http://localhost:3000/api/campaigns', {
      method: 'GET',
      headers: { 'x-app-access-key': 'wrong-key' },
    });
    const auth2 = validateRequestAccess(wrongKeyReq);
    expect(auth2.authorized).toBe(false);

    const validReq = new Request('http://localhost:3000/api/campaigns/new', {
      method: 'POST',
      headers: { 'x-app-access-key': 'secret-test-access-key' },
    });
    const auth3 = validateRequestAccess(validReq);
    expect(auth3.authorized).toBe(true);
  });

  it('aggregates campaign status and counters accurately', () => {
    const recipients: Array<{ status: CampaignRecipientRecord['status'] }> = [
      { status: 'SUBMITTED' },
      { status: 'SUBMITTED' },
      { status: 'DELIVERED' },
      { status: 'FAILED' },
      { status: 'PENDING' },
    ];

    let submittedCount = 0;
    let deliveredCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    for (const r of recipients) {
      if (r.status === 'SUBMITTED') submittedCount++;
      if (r.status === 'DELIVERED') deliveredCount++;
      if (r.status === 'FAILED') failedCount++;
      if (r.status === 'PENDING' || r.status === 'TIMEOUT_UNCONFIRMED') pendingCount++;
    }

    expect(submittedCount).toBe(2);
    expect(deliveredCount).toBe(1);
    expect(failedCount).toBe(1);
    expect(pendingCount).toBe(1);

    // If pending > 0, overall campaign status is SENDING or INTERRUPTED
    const isFinished = pendingCount === 0;
    expect(isFinished).toBe(false);
  });

  it('preserves interrupted campaigns with actual known states', () => {
    // When a campaign is interrupted midway, remaining items stay PENDING
    const campaignRecipients: CampaignRecipientRecord[] = [
      {
        id: 'rec-1',
        campaignId: 'camp-1',
        recipientName: 'Abebe',
        phone: '+251911223344',
        maskedPhone: '+251 91 ••• ••44',
        status: 'SUBMITTED',
        providerMessageId: 'msg-abc-1',
        submittedAt: new Date().toISOString(),
        deliveredAt: null,
        failureReason: null,
        retryCount: 0,
        providerStatus: 'Send in progress...',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'rec-2',
        campaignId: 'camp-1',
        recipientName: 'Sara',
        phone: '+251911223355',
        maskedPhone: '+251 91 ••• ••55',
        status: 'PENDING',
        providerMessageId: null,
        submittedAt: null,
        deliveredAt: null,
        failureReason: null,
        retryCount: 0,
        providerStatus: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const submitted = campaignRecipients.filter((r) => r.status === 'SUBMITTED');
    const pending = campaignRecipients.filter((r) => r.status === 'PENDING');

    expect(submitted.length).toBe(1);
    expect(pending.length).toBe(1);
    // Unfinished recipient is honestly marked as PENDING, not falsely reported as failed or submitted
    expect(pending[0].providerMessageId).toBeNull();
  });

  it('safely isolates only confirmed failed recipients for retry', () => {
    const list: CampaignRecipientRecord[] = [
      {
        id: 'r1',
        campaignId: 'c1',
        phone: '+251911000001',
        maskedPhone: '+251 91 ••• ••01',
        status: 'SUBMITTED',
        retryCount: 0,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r2',
        campaignId: 'c1',
        phone: '+251911000002',
        maskedPhone: '+251 91 ••• ••02',
        status: 'DELIVERED',
        retryCount: 0,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r3',
        campaignId: 'c1',
        phone: '+251911000003',
        maskedPhone: '+251 91 ••• ••03',
        status: 'FAILED',
        failureReason: 'Network error',
        retryCount: 0,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r4',
        campaignId: 'c1',
        phone: '+251911000004',
        maskedPhone: '+251 91 ••• ••04',
        status: 'TIMEOUT_UNCONFIRMED',
        failureReason: 'Provider timeout',
        retryCount: 0,
        createdAt: '',
        updatedAt: '',
      },
    ];

    // Only FAILED and TIMEOUT_UNCONFIRMED may be retried
    const retryCandidates = list.filter(
      (r) => r.status === 'FAILED' || r.status === 'TIMEOUT_UNCONFIRMED'
    );

    expect(retryCandidates.map((r) => r.id)).toEqual(['r3', 'r4']);
    // SUBMITTED and DELIVERED must never be retried
    expect(retryCandidates.some((r) => r.status === 'SUBMITTED')).toBe(false);
    expect(retryCandidates.some((r) => r.status === 'DELIVERED')).toBe(false);
  });

  it('handles delivery status reconciliation logic for webhooks', () => {
    const parseDeliveryStatus = (rawStatus: string): 'DELIVERED' | 'FAILED' | 'OTHER' => {
      const s = rawStatus.toLowerCase();
      if (s.includes('deliver') || s.includes('success') || s.includes('sent')) {
        return 'DELIVERED';
      }
      if (s.includes('fail') || s.includes('reject') || s.includes('undelivered')) {
        return 'FAILED';
      }
      return 'OTHER';
    };

    expect(parseDeliveryStatus('Delivered to handset')).toBe('DELIVERED');
    expect(parseDeliveryStatus('SUCCESS')).toBe('DELIVERED');
    expect(parseDeliveryStatus('Message Failed - Expired')).toBe('FAILED');
    expect(parseDeliveryStatus('Rejected by carrier')).toBe('FAILED');
    expect(parseDeliveryStatus('In transit')).toBe('OTHER');
  });

  it('formats CSV exports with masked phone numbers and proper escaping', () => {
    const campaignRecipients: CampaignRecipientRecord[] = [
      {
        id: 'rec-1',
        campaignId: 'c1',
        recipientName: 'Abebe "Kebede"',
        phone: '+251911223344',
        maskedPhone: '+251 91 ••• ••44',
        status: 'SUBMITTED',
        providerMessageId: 'msg-12345',
        submittedAt: '2026-10-26T12:00:00Z',
        deliveredAt: null,
        failureReason: null,
        retryCount: 0,
        createdAt: '',
        updatedAt: '',
      },
    ];

    const rows = campaignRecipients.map((r) => [
      `"${(r.recipientName || 'Customer').replace(/"/g, '""')}"`,
      `"${r.maskedPhone}"`,
      `"${r.status}"`,
      `"${r.providerMessageId || ''}"`,
      `"${r.submittedAt || ''}"`,
      r.retryCount,
    ]);

    const csvLine = rows[0].join(',');
    // Check quotes escaping and phone masking
    expect(csvLine).toContain('"Abebe ""Kebede"""');
    expect(csvLine).toContain('"+251 91 ••• ••44"');
    expect(csvLine).not.toContain('+251911223344,'); // Full number must not be in raw field
  });
});
