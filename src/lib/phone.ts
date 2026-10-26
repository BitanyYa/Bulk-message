/**
 * Phone number normalization, validation, and privacy masking utilities.
 */

export interface PhoneValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
}

/**
 * Normalizes phone numbers according to AfroMessage requirements:
 * Requires international format with '+' prefix (e.g., +251911223344).
 * 
 * Supports Ethiopian standard numbers:
 * - 0911223344 -> +251911223344 (Ethio Telecom)
 * - 0712345678 -> +251712345678 (Safaricom Ethiopia)
 * - 911223344 / 712345678 -> +251911223344 / +251712345678
 * - 251911223344 -> +251911223344
 * - +251911223344 -> +251911223344
 * 
 * Also supports other international E.164 numbers (e.g., +12025550123).
 */
export function normalizePhoneNumber(raw: unknown, defaultCountryCode = '+251'): PhoneValidationResult {
  if (raw === null || raw === undefined) {
    return { isValid: false, normalized: '', error: 'Phone number is missing' };
  }

  // Convert to string and trim whitespace
  let cleaned = String(raw).trim();

  if (cleaned.length === 0) {
    return { isValid: false, normalized: '', error: 'Phone number is empty' };
  }

  // Remove common phone formatting characters: spaces, dashes, parentheses, dots
  cleaned = cleaned.replace(/[\s\-().]/g, '');

  const hasLeadingPlus = cleaned.startsWith('+');
  if (hasLeadingPlus) {
    cleaned = cleaned.slice(1);
  }

  // Check if remaining characters are digits
  if (!/^\d+$/.test(cleaned)) {
    return {
      isValid: false,
      normalized: String(raw).trim(),
      error: 'Contains invalid non-digit characters',
    };
  }

  let normalized = '';

  // Ethiopian mobile number normalization:
  // Ethiopian mobile numbers are 9 digits without leading 0 (e.g., 911223344, 712345678)
  // or 10 digits with leading 0 (e.g., 0911223344, 0712345678)
  if (!hasLeadingPlus && cleaned.startsWith('0') && cleaned.length === 10) {
    // 09... or 07...
    const prefix = cleaned.slice(1, 2);
    if (prefix === '9' || prefix === '7') {
      normalized = `+251${cleaned.slice(1)}`;
    } else {
      normalized = `+251${cleaned.slice(1)}`;
    }
  } else if (!hasLeadingPlus && (cleaned.startsWith('9') || cleaned.startsWith('7')) && cleaned.length === 9) {
    // 911223344 or 712345678
    normalized = `+251${cleaned}`;
  } else if (cleaned.startsWith('251') && (cleaned.length === 12)) {
    // 251911223344
    normalized = `+${cleaned}`;
  } else if (hasLeadingPlus) {
    normalized = `+${cleaned}`;
  } else {
    // Other format: if a default country code is provided and it looks like a national number
    const code = defaultCountryCode.startsWith('+') ? defaultCountryCode : `+${defaultCountryCode}`;
    normalized = `${code}${cleaned}`;
  }

  // Validate E.164 format: + followed by 7 to 15 digits
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  if (!e164Regex.test(normalized)) {
    return {
      isValid: false,
      normalized,
      error: 'Invalid phone number length or structure',
    };
  }

  return {
    isValid: true,
    normalized,
  };
}

/**
 * Masks a phone number for user privacy in UI tables and logs.
 * Example: +251911223344 -> +251 91 ••• ••34
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 5) {
    return '•••••';
  }

  const trimmed = phone.trim();

  // If standard Ethiopian +251911223344 format (length 13):
  if (trimmed.startsWith('+251') && trimmed.length === 13) {
    const code = '+251';
    const prefix = trimmed.slice(4, 6); // e.g. "91"
    const suffix = trimmed.slice(11);   // last 2 digits
    return `${code} ${prefix} ••• ••${suffix}`;
  }

  // If local Ethiopian format 0911223344 (length 10):
  if (trimmed.startsWith('0') && trimmed.length === 10) {
    const prefix = trimmed.slice(0, 3); // e.g. "091"
    const suffix = trimmed.slice(8);   // last 2 digits
    return `${prefix} ••• ••${suffix}`;
  }

  // General masking: show first 3 chars, mask middle, show last 2 chars
  const visibleStart = Math.min(4, Math.floor(trimmed.length / 3));
  const visibleEnd = 2;
  const start = trimmed.slice(0, visibleStart);
  const end = trimmed.slice(trimmed.length - visibleEnd);

  return `${start} ••• ••${end}`;
}
