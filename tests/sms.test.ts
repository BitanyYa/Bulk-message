import { describe, it, expect } from 'vitest';
import {
  analyzeSmsMessage,
  personalizeMessage,
  findUnresolvedPlaceholders,
  estimateCampaignSegments,
  isUnicodeMessage,
} from '@/lib/sms';

describe('SMS Personalization and Segment Estimation', () => {
  it('replaces {{name}} case-insensitively with customer name', () => {
    const template = 'Hello {{name}}, welcome to Yonas Mobile!';
    const personalized = personalizeMessage(template, 'Abebe');
    expect(personalized).toBe('Hello Abebe, welcome to Yonas Mobile!');

    const spacedTemplate = 'Dear {{  Name  }}, your order is ready.';
    expect(personalizeMessage(spacedTemplate, 'Sara')).toBe('Dear Sara, your order is ready.');
  });

  it('keeps identical message if no placeholder is present', () => {
    const template = 'Special discount available at Yonas Mobile today only!';
    const personalized = personalizeMessage(template, 'Abebe');
    expect(personalized).toBe(template);
  });

  it('flags unhandled placeholders', () => {
    const invalidTemplate = 'Hello {{name}}, your balance is {{amount}} on {{date}}!';
    const unresolved = findUnresolvedPlaceholders(invalidTemplate);
    expect(unresolved).toEqual(['{{amount}}', '{{date}}']);

    const validTemplate = 'Hello {{name}}, thank you!';
    expect(findUnresolvedPlaceholders(validTemplate)).toEqual([]);
  });

  it('handles empty message analysis', () => {
    const analysis = analyzeSmsMessage('');
    expect(analysis.charCount).toBe(0);
    expect(analysis.segmentCount).toBe(0);
    expect(analysis.encoding).toBe('GSM-7');
  });

  it('calculates single and multi-segment GSM-7 messages correctly', () => {
    // 160 characters in GSM-7 = 1 segment
    const singleSegment = 'A'.repeat(160);
    const analysis1 = analyzeSmsMessage(singleSegment);
    expect(analysis1.encoding).toBe('GSM-7');
    expect(analysis1.charCount).toBe(160);
    expect(analysis1.segmentCount).toBe(1);
    expect(analysis1.charsRemainingInSegment).toBe(0);
    expect(analysis1.warning).toBeUndefined();

    // 161 characters in GSM-7 = 2 segments (153 chars/segment concatenated)
    const multiSegment = 'A'.repeat(161);
    const analysis2 = analyzeSmsMessage(multiSegment);
    expect(analysis2.encoding).toBe('GSM-7');
    expect(analysis2.segmentCount).toBe(2);
    expect(analysis2.charsPerSegment).toBe(153);
    expect(analysis2.warning).toContain('Message will be sent as 2 concatenated SMS segments');
  });

  it('accounts for GSM-7 extended characters costing 2 septets', () => {
    // The Euro sign € is an extended character in GSM-7
    const euroText = 'Price: 10€';
    // 'Price: 10' = 9 chars + 2 for € = 11 chars
    const analysis = analyzeSmsMessage(euroText);
    expect(analysis.encoding).toBe('GSM-7');
    expect(analysis.charCount).toBe(11);
  });

  it('detects Unicode messages and applies 70/67 character rules', () => {
    // Amharic Ge'ez text: "ሰላም" (Hello)
    const amharicText = 'ሰላም አበበ';
    expect(isUnicodeMessage(amharicText)).toBe(true);

    const analysis = analyzeSmsMessage(amharicText);
    expect(analysis.encoding).toBe('UCS-2');
    expect(analysis.hasUnicode).toBe(true);
    expect(analysis.segmentCount).toBe(1);
    expect(analysis.charsPerSegment).toBe(70);

    // Multi-segment Unicode (71 characters = 2 segments of 67)
    const longAmharic = 'ሰ'.repeat(71);
    const analysisMulti = analyzeSmsMessage(longAmharic);
    expect(analysisMulti.encoding).toBe('UCS-2');
    expect(analysisMulti.segmentCount).toBe(2);
    expect(analysisMulti.charsPerSegment).toBe(67);
  });

  it('estimates campaign segments across multiple customer names', () => {
    const template = 'Hello {{name}}, Yonas Mobile has a special offer for you!';
    const names = ['Bo', 'Alexander Maximillian III', 'Li'];
    const campaignEstimate = estimateCampaignSegments(template, names);

    expect(campaignEstimate.totalSegments).toBe(3);
    expect(campaignEstimate.samplePersonalized.length).toBe(3);
    expect(campaignEstimate.samplePersonalized[0].message).toContain('Hello Bo,');
  });
});
