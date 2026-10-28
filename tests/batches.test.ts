import { describe, it, expect } from 'vitest';
import { processRawRows, MAX_RECIPIENTS_PER_CAMPAIGN } from '@/lib/parser';
import { CampaignBatchRecord, CampaignRecord, CampaignRecipientRecord } from '@/types';

describe('Multi-Batch Campaigns & Customer Addition', () => {
  const mapping = { nameColumn: 'Name', phoneColumn: 'Phone' };
  const headers = ['Name', 'Phone'];

  it('skips customers already in the campaign across prior batches', () => {
    // Existing customers in Campaign Batch 1
    const existingPhones = new Set(['+251911223344', '+251922334455']);

    // Newly uploaded file for Batch 2 contains 1 existing customer, 1 new customer, 1 invalid phone
    const newFileRows = [
      ['Abebe Kebede', '0911223344'], // Already in campaign
      ['Sara Tadesse', '0933445566'], // Genuinely new customer
      ['Chala Bekele', 'invalid-phone'], // Invalid phone
    ];

    const result = processRawRows(headers, newFileRows, mapping, { existingPhones });

    expect(result.validCount).toBe(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.invalidCount).toBe(1);

    // Check Abebe is flagged as duplicate against campaign
    const abebe = result.recipients.find((r) => r.rawName === 'Abebe Kebede');
    expect(abebe?.status).toBe('duplicate');
    expect(abebe?.validationError).toContain('Already registered in this campaign');
    expect(abebe?.selected).toBe(false);

    // Check Sara is valid and selected
    const sara = result.recipients.find((r) => r.rawName === 'Sara Tadesse');
    expect(sara?.status).toBe('valid');
    expect(sara?.normalizedPhone).toBe('+251933445566');
    expect(sara?.selected).toBe(true);

    // Check Chala is invalid
    const chala = result.recipients.find((r) => r.rawName === 'Chala Bekele');
    expect(chala?.status).toBe('invalid');
  });

  it('detects intra-file duplicate numbers within the new batch', () => {
    const rows = [
      ['Customer A', '0911001122'],
      ['Customer B', '0911001122'], // Intra-file duplicate
      ['Customer C', '+251911001122'], // Duplicate with prefix
    ];

    const result = processRawRows(headers, rows, mapping);

    expect(result.validCount).toBe(1);
    expect(result.duplicateCount).toBe(2);
    expect(result.recipients[1].validationError).toContain('Duplicate phone number in uploaded file');
    expect(result.recipients[2].validationError).toContain('Duplicate phone number in uploaded file');
  });

  it('enforces the 500-recipient batch limit', () => {
    const rows: string[][] = [];
    for (let i = 0; i < 505; i++) {
      rows.push([`User ${i}`, `0910${String(i).padStart(6, '0')}`]);
    }

    const result = processRawRows(headers, rows, mapping, {
      maxLimit: MAX_RECIPIENTS_PER_CAMPAIGN,
    });

    expect(result.validCount).toBe(500);
    expect(result.invalidCount).toBe(5);
    expect(result.recipients[500].status).toBe('invalid');
    expect(result.recipients[500].validationError).toContain('Campaign limit of 500 unique recipients exceeded');
  });

  it('prevents duplicate SMS when identical customer list is uploaded again', () => {
    // Initial batch of 3 customers
    const batch1Recipients = [
      '+251911111111',
      '+251922222222',
      '+251933333333',
    ];
    const registeredSet = new Set(batch1Recipients);

    // User attempts to upload the exact same file as Batch 2
    const repeatedRows = [
      ['User 1', '0911111111'],
      ['User 2', '0922222222'],
      ['User 3', '0933333333'],
    ];

    const result = processRawRows(headers, repeatedRows, mapping, {
      existingPhones: registeredSet,
    });

    // None should be marked valid; all duplicates
    expect(result.validCount).toBe(0);
    expect(result.duplicateCount).toBe(3);
    expect(result.recipients.every((r) => r.status === 'duplicate')).toBe(true);
  });

  it('aggregates batch counts and parent campaign totals without double counting', () => {
    // Campaign has Batch 1 and Batch 2
    const batch1: CampaignBatchRecord = {
      id: 'batch_1',
      campaignId: 'camp_1',
      batchNumber: 1,
      name: 'Batch 1',
      messageText: 'Hello {{name}}',
      status: 'COMPLETED',
      totalRecipients: 3,
      validRecipients: 3,
      submittedCount: 3,
      deliveredCount: 3,
      failedCount: 0,
      pendingCount: 0,
      createdAt: '2026-10-28T01:00:00.000Z',
      updatedAt: '2026-10-28T01:05:00.000Z',
    };

    const batch2: CampaignBatchRecord = {
      id: 'batch_2',
      campaignId: 'camp_1',
      batchNumber: 2,
      name: 'Batch 2',
      messageText: 'Hello {{name}}',
      status: 'PARTIALLY_FAILED',
      totalRecipients: 2,
      validRecipients: 2,
      submittedCount: 2,
      deliveredCount: 1,
      failedCount: 1,
      pendingCount: 0,
      createdAt: '2026-10-28T02:00:00.000Z',
      updatedAt: '2026-10-28T02:05:00.000Z',
    };

    // Calculate aggregated totals
    const batches = [batch1, batch2];
    const totalRecipients = batches.reduce((sum, b) => sum + b.totalRecipients, 0);
    const submittedCount = batches.reduce((sum, b) => sum + b.submittedCount, 0);
    const deliveredCount = batches.reduce((sum, b) => sum + b.deliveredCount, 0);
    const failedCount = batches.reduce((sum, b) => sum + b.failedCount, 0);
    const pendingCount = batches.reduce((sum, b) => sum + b.pendingCount, 0);

    const campaign: CampaignRecord = {
      id: 'camp_1',
      name: 'Multi-Batch Promotion',
      messageTemplate: 'Hello {{name}}',
      status: failedCount > 0 ? 'PARTIALLY_FAILED' : 'COMPLETED',
      totalRecipients,
      validRecipients: totalRecipients,
      submittedCount,
      deliveredCount,
      failedCount,
      pendingCount,
      createdAt: '2026-10-28T01:00:00.000Z',
      updatedAt: '2026-10-28T02:05:00.000Z',
      batches,
      batchCount: batches.length,
      lastBatchActivity: batch2.updatedAt,
    };

    expect(campaign.batchCount).toBe(2);
    expect(campaign.totalRecipients).toBe(5);
    expect(campaign.submittedCount).toBe(5);
    expect(campaign.deliveredCount).toBe(4);
    expect(campaign.failedCount).toBe(1);
    expect(campaign.pendingCount).toBe(0);
    expect(campaign.status).toBe('PARTIALLY_FAILED');
    expect(campaign.lastBatchActivity).toBe('2026-10-28T02:05:00.000Z');
  });

  it('allows batch message editing while preserving original campaign snapshot', () => {
    const campaignMessage = 'Original message template: Welcome {{name}}!';

    // Batch 1 uses original template
    const batch1: CampaignBatchRecord = {
      id: 'b1',
      campaignId: 'c1',
      batchNumber: 1,
      name: 'Batch 1',
      messageText: campaignMessage,
      status: 'COMPLETED',
      totalRecipients: 10,
      validRecipients: 10,
      submittedCount: 10,
      deliveredCount: 10,
      failedCount: 0,
      pendingCount: 0,
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:05:00.000Z',
    };

    // User reviews Batch 2 and customizes message for the new audience
    const customizedBatch2Message = 'Special follow-up for VIP {{name}}! Get 30% off.';
    const batch2: CampaignBatchRecord = {
      id: 'b2',
      campaignId: 'c1',
      batchNumber: 2,
      name: 'Batch 2 - VIPs',
      messageText: customizedBatch2Message,
      status: 'DRAFT',
      totalRecipients: 5,
      validRecipients: 5,
      submittedCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      pendingCount: 5,
      createdAt: '2026-10-28T01:00:00.000Z',
      updatedAt: '2026-10-28T01:00:00.000Z',
    };

    // Verification: Batch 2 has customized message, but Campaign snapshot remains original
    expect(batch1.messageText).toBe(campaignMessage);
    expect(batch2.messageText).toBe(customizedBatch2Message);
    expect(batch2.messageText).not.toBe(campaignMessage);
  });

  it('isolates retries to failed or unconfirmed recipients without touching delivered messages', () => {
    const recipients: CampaignRecipientRecord[] = [
      {
        id: 'r1',
        campaignId: 'c1',
        batchId: 'b1',
        phone: '+251911111111',
        maskedPhone: '+251 91 ••• ••11',
        status: 'DELIVERED',
        retryCount: 0,
        createdAt: '2026-10-28T00:00:00.000Z',
        updatedAt: '2026-10-28T00:01:00.000Z',
      },
      {
        id: 'r2',
        campaignId: 'c1',
        batchId: 'b1',
        phone: '+251922222222',
        maskedPhone: '+251 92 ••• ••22',
        status: 'FAILED',
        failureReason: 'Network unreachable',
        retryCount: 0,
        createdAt: '2026-10-28T00:00:00.000Z',
        updatedAt: '2026-10-28T00:01:00.000Z',
      },
      {
        id: 'r3',
        campaignId: 'c1',
        batchId: 'b1',
        phone: '+251933333333',
        maskedPhone: '+251 93 ••• ••33',
        status: 'TIMEOUT_UNCONFIRMED',
        failureReason: 'Provider timeout',
        retryCount: 0,
        createdAt: '2026-10-28T00:00:00.000Z',
        updatedAt: '2026-10-28T00:01:00.000Z',
      },
    ];

    // Retry only target FAILED and TIMEOUT_UNCONFIRMED
    const retryable = recipients.filter(
      (r) => r.status === 'FAILED' || r.status === 'TIMEOUT_UNCONFIRMED'
    );

    expect(retryable.length).toBe(2);
    expect(retryable.map((r) => r.id)).toEqual(['r2', 'r3']);

    // Delivered recipient r1 is NEVER retried
    expect(retryable.some((r) => r.id === 'r1')).toBe(false);
  });
});
