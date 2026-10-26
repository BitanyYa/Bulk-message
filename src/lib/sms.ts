import { SmsEncoding, SmsEncodingDetails } from '@/types';

// GSM 7-bit default alphabet characters
const GSM7_BASIC = new Set([
  '@', '£', '$', '¥', 'è', 'é', 'ù', 'ì', 'ò', 'Ç', '\n', 'Ø', 'ø', '\r', 'Å', 'å',
  'Δ', '_', 'Φ', 'Γ', 'Λ', 'Ω', 'Π', 'Ψ', 'Σ', 'Θ', 'Ξ', 'Æ', 'æ', 'ß', 'É',
  ' ', '!', '"', '#', '¤', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
  '¡', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Ä', 'Ö', 'Ñ', 'Ü', '§',
  '¿', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'ä', 'ö', 'ñ', 'ü', 'à'
]);

// GSM 7-bit extended characters (each counts as 2 characters due to escape byte)
const GSM7_EXTENDED = new Set(['^', '{', '}', '\\', '[', '~', ']', '|', '€']);

/**
 * Checks if a string contains non-GSM-7 characters (which forces UCS-2 encoding).
 */
export function isUnicodeMessage(text: string): boolean {
  for (const char of text) {
    if (!GSM7_BASIC.has(char) && !GSM7_EXTENDED.has(char)) {
      return true;
    }
  }
  return false;
}

/**
 * Calculates SMS encoding, character count, and segment count.
 */
export function analyzeSmsMessage(text: string): SmsEncodingDetails {
  if (!text || text.length === 0) {
    return {
      encoding: 'GSM-7',
      charCount: 0,
      segmentCount: 0,
      charsPerSegment: 160,
      charsRemainingInSegment: 160,
      hasUnicode: false,
    };
  }

  const hasUnicode = isUnicodeMessage(text);
  const encoding: SmsEncoding = hasUnicode ? 'UCS-2' : 'GSM-7';

  let effectiveCharCount = 0;
  if (hasUnicode) {
    // In UCS-2, surrogate pairs (like some emojis) count as 2 UTF-16 code units
    effectiveCharCount = Array.from(text).length; // or text.length code units
    // Standard SMS UCS-2 uses 16-bit code units (70 code units single, 67 concatenated)
    effectiveCharCount = text.length;
  } else {
    // In GSM-7, basic = 1, extended = 2
    for (const char of text) {
      if (GSM7_EXTENDED.has(char)) {
        effectiveCharCount += 2;
      } else {
        effectiveCharCount += 1;
      }
    }
  }

  let segmentCount = 1;
  let charsPerSegment = 160;
  let charsRemainingInSegment = 0;

  if (encoding === 'GSM-7') {
    if (effectiveCharCount <= 160) {
      segmentCount = 1;
      charsPerSegment = 160;
      charsRemainingInSegment = 160 - effectiveCharCount;
    } else {
      charsPerSegment = 153;
      segmentCount = Math.ceil(effectiveCharCount / 153);
      charsRemainingInSegment = segmentCount * 153 - effectiveCharCount;
    }
  } else {
    // UCS-2 (Unicode)
    if (effectiveCharCount <= 70) {
      segmentCount = 1;
      charsPerSegment = 70;
      charsRemainingInSegment = 70 - effectiveCharCount;
    } else {
      charsPerSegment = 67;
      segmentCount = Math.ceil(effectiveCharCount / 67);
      charsRemainingInSegment = segmentCount * 67 - effectiveCharCount;
    }
  }

  let warning: string | undefined;
  if (segmentCount > 1) {
    warning = `Message will be sent as ${segmentCount} concatenated SMS segments per recipient.`;
  }
  if (hasUnicode) {
    warning = warning
      ? `${warning} Contains Unicode characters (70 chars/segment).`
      : 'Contains Unicode characters, limited to 70 characters per segment.';
  }

  return {
    encoding,
    charCount: effectiveCharCount,
    segmentCount,
    charsPerSegment,
    charsRemainingInSegment,
    hasUnicode,
    warning,
  };
}

/**
 * Replaces the {{name}} placeholder with the customer's name.
 */
export function personalizeMessage(template: string, name: string): string {
  if (!template) return '';
  // Support {{name}}, {{ name }}, {{Name}}, etc.
  return template.replace(/\{\{\s*name\s*\}\}/gi, name.trim());
}

/**
 * Checks for any unhandled placeholders in the message template.
 * Valid placeholder is only {{name}}. Any other {{...}} pattern is flagged.
 */
export function findUnresolvedPlaceholders(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
  const invalid: string[] = [];
  for (const match of matches) {
    const key = match.replace(/[{}]/g, '').trim().toLowerCase();
    if (key !== 'name') {
      invalid.push(match);
    }
  }
  return invalid;
}

/**
 * Computes the worst-case segment count for a personalized template across a list of customer names.
 */
export function estimateCampaignSegments(
  template: string,
  recipientNames: string[]
): {
  totalSegments: number;
  maxSegmentsPerMessage: number;
  samplePersonalized: Array<{ name: string; message: string; segments: number }>;
} {
  if (!template || recipientNames.length === 0) {
    return {
      totalSegments: 0,
      maxSegmentsPerMessage: 0,
      samplePersonalized: [],
    };
  }

  let totalSegments = 0;
  let maxSegmentsPerMessage = 0;
  const samplePersonalized: Array<{ name: string; message: string; segments: number }> = [];

  for (let i = 0; i < recipientNames.length; i++) {
    const name = recipientNames[i] || '';
    const personalized = personalizeMessage(template, name);
    const analysis = analyzeSmsMessage(personalized);

    totalSegments += analysis.segmentCount;
    if (analysis.segmentCount > maxSegmentsPerMessage) {
      maxSegmentsPerMessage = analysis.segmentCount;
    }

    if (i < 5) {
      samplePersonalized.push({
        name,
        message: personalized,
        segments: analysis.segmentCount,
      });
    }
  }

  return {
    totalSegments,
    maxSegmentsPerMessage,
    samplePersonalized,
  };
}
