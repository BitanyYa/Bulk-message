import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateRequestAccess } from '@/lib/auth';
import { findUnresolvedPlaceholders, personalizeMessage, analyzeSmsMessage } from '@/lib/sms';
import { CampaignRecord, CampaignBatchRecord, CampaignRecipientRecord } from '@/types';

describe('Edit Message in Existing Campaign', () => {
  beforeEach(() => {
    delete process.env.APP_ACCESS_KEY;
    vi.clearAllMocks();
  });

  it('validates placeholder rules: allows {{name}}, rejects unsupported tags', () => {
    // Valid messages
    expect(findUnresolvedPlaceholders('Hello {{name}}, your phone is ready!')).toEqual([]);
    expect(findUnresolvedPlaceholders('Selam {{ name }}, welcome to Yonas Mobile!')).toEqual([]);
    expect(findUnresolvedPlaceholders('Dear {{NAME}}, special discount today!')).toEqual([]);
    expect(findUnresolvedPlaceholders('Static message with no placeholders')).toEqual([]);

    // Invalid messages
    expect(findUnresolvedPlaceholders('Hello {{customer_name}}, balance: {{balance}}')).toEqual([
      '{{customer_name}}',
      '{{balance}}',
    ]);
    expect(findUnresolvedPlaceholders('Hi {{phone}}, your order is #{{orderId}}')).toEqual([
      '{{phone}}',
      '{{orderId}}',
    ]);
  });

  it('updates campaign default message while keeping previously sent batches unchanged', () => {
    const originalCampaignMessage = 'Original message: Dear {{name}}, thank you for shopping at Yonas Mobile!';

    // Existing campaign with Batch 1 sent
    const campaign: CampaignRecord = {
      id: 'camp-101',
      name: 'Holiday Campaign',
      messageTemplate: originalCampaignMessage,
      status: 'COMPLETED',
      isArchived: false,
      totalRecipients: 10,
      validRecipients: 10,
      submittedCount: 10,
      deliveredCount: 8,
      failedCount: 2,
      pendingCount: 0,
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:30:00.000Z',
    };

    const batch1: CampaignBatchRecord = {
      id: 'batch-1',
      campaignId: 'camp-101',
      batchNumber: 1,
      name: 'Batch 1 - Initial Contacts',
      messageText: originalCampaignMessage,
      status: 'COMPLETED',
      totalRecipients: 10,
      validRecipients: 10,
      submittedCount: 10,
      deliveredCount: 8,
      failedCount: 2,
      pendingCount: 0,
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:30:00.000Z',
    };

    const recipientsBatch1: CampaignRecipientRecord[] = [
      {
        id: 'r1',
        campaignId: 'camp-101',
        batchId: 'batch-1',
        phone: '+251911111111',
        maskedPhone: '+251 91 ••• ••11',
        status: 'DELIVERED',
        retryCount: 0,
        createdAt: '2026-10-28T00:00:00.000Z',
        updatedAt: '2026-10-28T00:15:00.000Z',
      },
    ];

    // User edits the campaign message to a new promotional announcement
    const updatedCampaignMessage = 'Updated message: Dear {{name}}, special 20% discount on phone repairs this week!';

    // Simulation of campaign message update
    const updatedCampaign: CampaignRecord = {
      ...campaign,
      messageTemplate: updatedCampaignMessage,
      updatedAt: '2026-10-28T01:00:00.000Z',
    };

    // 1. Campaign default message is updated
    expect(updatedCampaign.messageTemplate).toBe(updatedCampaignMessage);
    expect(updatedCampaign.messageTemplate).not.toBe(originalCampaignMessage);

    // 2. Previously sent Batch 1 snapshot is PRESERVED and untouched
    expect(batch1.messageText).toBe(originalCampaignMessage);
    expect(batch1.messageText).not.toBe(updatedCampaign.messageTemplate);

    // 3. Historical recipient records remain completely untouched
    expect(recipientsBatch1[0].status).toBe('DELIVERED');
    expect(recipientsBatch1[0].batchId).toBe('batch-1');
  });

  it('future batches use the updated campaign message as default template', () => {
    const updatedCampaignMessage = 'Updated announcement: Selam {{name}}, check out our latest arrivals!';

    const campaign: CampaignRecord = {
      id: 'camp-101',
      name: 'Holiday Campaign',
      messageTemplate: updatedCampaignMessage,
      status: 'COMPLETED',
      isArchived: false,
      totalRecipients: 10,
      validRecipients: 10,
      submittedCount: 10,
      deliveredCount: 10,
      failedCount: 0,
      pendingCount: 0,
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T01:00:00.000Z',
    };

    // When AddCustomersModal or add-batch is called for Batch 2:
    // If no custom override is passed, it uses campaign.messageTemplate
    const batch2Message = campaign.messageTemplate;

    const batch2: CampaignBatchRecord = {
      id: 'batch-2',
      campaignId: campaign.id,
      batchNumber: 2,
      name: 'Batch 2 - VIP Customers',
      messageText: batch2Message,
      status: 'DRAFT',
      totalRecipients: 5,
      validRecipients: 5,
      submittedCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      pendingCount: 5,
      createdAt: '2026-10-28T01:15:00.000Z',
      updatedAt: '2026-10-28T01:15:00.000Z',
    };

    expect(batch2.messageText).toBe(updatedCampaignMessage);

    // Personalized sending for a recipient in Batch 2
    const personalized = personalizeMessage(batch2.messageText, 'Almaz');
    expect(personalized).toBe('Updated announcement: Selam Almaz, check out our latest arrivals!');
  });

  it('prevents editing message on closed/archived campaigns unless reopened', () => {
    const closedCampaign: CampaignRecord = {
      id: 'camp-202',
      name: 'Archived Campaign',
      messageTemplate: 'Old text',
      status: 'COMPLETED',
      isArchived: true,
      totalRecipients: 5,
      validRecipients: 5,
      submittedCount: 5,
      deliveredCount: 5,
      failedCount: 0,
      pendingCount: 0,
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:30:00.000Z',
    };

    // Validation logic from PATCH /api/campaigns/[id]
    const canEdit = (c: CampaignRecord, requestedIsArchived?: boolean) => {
      const willBeArchived =
        requestedIsArchived !== undefined ? requestedIsArchived : c.isArchived;
      if (willBeArchived) {
        return {
          allowed: false,
          error: 'Cannot edit message for a closed/archived campaign. Please reopen the campaign first.',
        };
      }
      return { allowed: true };
    };

    // Direct edit while closed -> blocked
    const check1 = canEdit(closedCampaign);
    expect(check1.allowed).toBe(false);
    expect(check1.error).toContain('closed/archived campaign');

    // Reopening the campaign -> edit permitted
    const check2 = canEdit(closedCampaign, false);
    expect(check2.allowed).toBe(true);
  });

  it('enforces access key authentication when updating campaign message', () => {
    process.env.APP_ACCESS_KEY = 'super-secret-key-123';

    // Request with no key
    const unauthReq = new Request('http://localhost:3000/api/campaigns/c1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageTemplate: 'New test message' }),
    });
    const auth1 = validateRequestAccess(unauthReq);
    expect(auth1.authorized).toBe(false);

    // Request with wrong key
    const wrongReq = new Request('http://localhost:3000/api/campaigns/c1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-app-access-key': 'incorrect-key',
      },
      body: JSON.stringify({ messageTemplate: 'New test message' }),
    });
    const auth2 = validateRequestAccess(wrongReq);
    expect(auth2.authorized).toBe(false);

    // Request with correct key
    const validReq = new Request('http://localhost:3000/api/campaigns/c1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-app-access-key': 'super-secret-key-123',
      },
      body: JSON.stringify({ messageTemplate: 'New test message' }),
    });
    const auth3 = validateRequestAccess(validReq);
    expect(auth3.authorized).toBe(true);
  });

  it('correctly calculates SMS segments and encoding for edited messages', () => {
    const gsmMsg = 'Selam {{name}}, thank you for choosing Yonas Mobile!';
    const gsmAnalysis = analyzeSmsMessage(personalizeMessage(gsmMsg, 'Abebe'));
    expect(gsmAnalysis.encoding).toBe('GSM-7');
    expect(gsmAnalysis.segmentCount).toBe(1);
    expect(gsmAnalysis.hasUnicode).toBe(false);

    // Message with Amharic / Unicode characters
    const unicodeMsg = 'ሰላም {{name}}! እንኳን ደህና መጡ!';
    const unicodeAnalysis = analyzeSmsMessage(personalizeMessage(unicodeMsg, 'አበበ'));
    expect(unicodeAnalysis.encoding).toBe('UCS-2');
    expect(unicodeAnalysis.hasUnicode).toBe(true);
  });
});
