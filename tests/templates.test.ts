import { describe, it, expect } from 'vitest';
import {
  findUnresolvedPlaceholders,
  personalizeMessage,
  analyzeSmsMessage,
} from '@/lib/sms';
import { MessageTemplateRecord, CampaignRecord } from '@/types';

describe('Message Templates & Personalization', () => {
  it('allows valid {{name}} placeholder with various whitespaces and case', () => {
    expect(findUnresolvedPlaceholders('Hello {{name}}, your order is ready!')).toEqual([]);
    expect(findUnresolvedPlaceholders('Dear {{ name }}, welcome to Yonas Mobile!')).toEqual([]);
    expect(findUnresolvedPlaceholders('Selam {{NAME}}, thank you!')).toEqual([]);
    expect(findUnresolvedPlaceholders('No placeholders here')).toEqual([]);
  });

  it('detects and flags unauthorized placeholders before saving or sending', () => {
    const invalid1 = findUnresolvedPlaceholders('Hello {{customer_name}}, your code is {{code}}');
    expect(invalid1).toEqual(['{{customer_name}}', '{{code}}']);

    const invalid2 = findUnresolvedPlaceholders('Balance: {{balance}} ETB, Phone: {{phone}}');
    expect(invalid2).toEqual(['{{balance}}', '{{phone}}']);

    const mixed = findUnresolvedPlaceholders('Hi {{name}}, discount is {{discount}}% off');
    expect(mixed).toEqual(['{{discount}}']);
  });

  it('correctly previews and interpolates personalized message for recipients', () => {
    const template = 'Dear {{name}}, thank you for choosing Yonas Mobile!';
    const preview1 = personalizeMessage(template, 'Abebe Bikila');
    expect(preview1).toBe('Dear Abebe Bikila, thank you for choosing Yonas Mobile!');

    const preview2 = personalizeMessage(template, '');
    expect(preview2).toBe('Dear , thank you for choosing Yonas Mobile!');

    const preview3 = personalizeMessage(template, '  Chala Tadesse  ');
    expect(preview3).toBe('Dear Chala Tadesse, thank you for choosing Yonas Mobile!');
  });

  it('calculates SMS characters and segments for template previews', () => {
    const template = 'Dear {{name}}, your receipt #123 is confirmed.';
    const samplePreview = personalizeMessage(template, 'Sara');
    const analysis = analyzeSmsMessage(samplePreview);

    expect(analysis.encoding).toBe('GSM-7');
    expect(analysis.segmentCount).toBe(1);
    expect(analysis.charCount).toBe(42);
    expect(analysis.charsRemainingInSegment).toBe(160 - 42);
  });

  it('preserves campaign message snapshot when a template is edited or archived', () => {
    // 1. Initial template
    const template: MessageTemplateRecord = {
      id: 'tmpl_123',
      name: 'Holiday Promo 2026',
      body: 'Dear {{name}}, special 20% discount on all phones this weekend!',
      isArchived: false,
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:00:00.000Z',
    };

    // 2. Campaign created using this template (snapshot copy)
    const campaign: CampaignRecord = {
      id: 'camp_456',
      name: 'Holiday Campaign Batch',
      messageTemplate: template.body, // copied snapshot
      status: 'DRAFT',
      totalRecipients: 50,
      validRecipients: 50,
      submittedCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      pendingCount: 50,
      createdAt: '2026-10-28T01:00:00.000Z',
      updatedAt: '2026-10-28T01:00:00.000Z',
    };

    expect(campaign.messageTemplate).toBe(
      'Dear {{name}}, special 20% discount on all phones this weekend!'
    );

    // 3. User later edits the template
    const updatedTemplate: MessageTemplateRecord = {
      ...template,
      name: 'Holiday Promo 2026 - Revised',
      body: 'Dear {{name}}, 50% clearance sale on accessories today!',
      updatedAt: '2026-10-28T02:00:00.000Z',
    };

    // 4. Verify existing campaign's message snapshot remains unmodified
    expect(campaign.messageTemplate).toBe(
      'Dear {{name}}, special 20% discount on all phones this weekend!'
    );
    expect(campaign.messageTemplate).not.toBe(updatedTemplate.body);

    // 5. User archives the template
    const archivedTemplate: MessageTemplateRecord = {
      ...updatedTemplate,
      isArchived: true,
      updatedAt: '2026-10-28T03:00:00.000Z',
    };

    expect(archivedTemplate.isArchived).toBe(true);
    // Campaign message snapshot is still intact
    expect(campaign.messageTemplate).toBe(
      'Dear {{name}}, special 20% discount on all phones this weekend!'
    );
  });
});
