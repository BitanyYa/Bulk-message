import { describe, it, expect } from 'vitest';
import { normalizePhoneNumber, maskPhoneNumber } from '@/lib/phone';

describe('Phone Number Normalization & Masking', () => {
  it('normalizes Ethiopian 10-digit mobile numbers with leading zero', () => {
    const res = normalizePhoneNumber('0911223344');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+251911223344');

    const safaricom = normalizePhoneNumber('0712345678');
    expect(safaricom.isValid).toBe(true);
    expect(safaricom.normalized).toBe('+251712345678');
  });

  it('normalizes 9-digit Ethiopian mobile numbers without leading zero', () => {
    const res = normalizePhoneNumber('911223344');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+251911223344');

    const safaricom = normalizePhoneNumber('712345678');
    expect(safaricom.isValid).toBe(true);
    expect(safaricom.normalized).toBe('+251712345678');
  });

  it('normalizes 12-digit Ethiopian numbers without plus', () => {
    const res = normalizePhoneNumber('251911223344');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+251911223344');
  });

  it('preserves already normalized international numbers', () => {
    const res = normalizePhoneNumber('+251911223344');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+251911223344');

    const usNum = normalizePhoneNumber('+12025550123');
    expect(usNum.isValid).toBe(true);
    expect(usNum.normalized).toBe('+12025550123');
  });

  it('cleans whitespace, dashes, parentheses and dots', () => {
    const res = normalizePhoneNumber('  0911-22 (33) .44  ');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+251911223344');
  });

  it('rejects invalid or empty phone numbers', () => {
    expect(normalizePhoneNumber('').isValid).toBe(false);
    expect(normalizePhoneNumber('   ').isValid).toBe(false);
    expect(normalizePhoneNumber(null).isValid).toBe(false);
    expect(normalizePhoneNumber(undefined).isValid).toBe(false);
    expect(normalizePhoneNumber('0911abc344').isValid).toBe(false);
    expect(normalizePhoneNumber('123').isValid).toBe(false);
    expect(normalizePhoneNumber('00000000000000000000').isValid).toBe(false);
  });

  it('masks phone numbers for privacy', () => {
    expect(maskPhoneNumber('+251911223344')).toBe('+251 91 ••• ••44');
    expect(maskPhoneNumber('0911223344')).toBe('091 ••• ••44');
    expect(maskPhoneNumber('+12025550123')).toContain('•••');
    expect(maskPhoneNumber('12')).toBe('•••••');
  });
});
