export type ValidationStatus = 'valid' | 'invalid' | 'duplicate';

export interface RecipientRecord {
  id: string;
  rawName: string;
  rawPhone: string;
  normalizedPhone: string;
  maskedPhone: string;
  status: ValidationStatus;
  validationError?: string;
  selected: boolean;
  rowNumber: number;
}

export interface ColumnMapping {
  nameColumn: string;
  phoneColumn: string;
}

export interface ParseResult {
  headers: string[];
  recipients: RecipientRecord[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  detectedMapping: ColumnMapping | null;
  exceedsLimit: boolean;
  fileError?: string;
}

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export interface SmsEncodingDetails {
  encoding: SmsEncoding;
  charCount: number;
  segmentCount: number;
  charsPerSegment: number;
  charsRemainingInSegment: number;
  hasUnicode: boolean;
  warning?: string;
  worstCaseSegmentCount?: number;
}

export interface SendRecipientItem {
  recipientId: string;
  name: string;
  phone: string;
  message: string;
}

export type SendStatus = 'pending' | 'submitted' | 'failed' | 'timeout_unconfirmed';

export interface RecipientSendResult {
  recipientId: string;
  name: string;
  phone: string;
  maskedPhone: string;
  status: SendStatus;
  messageId?: string;
  error?: string;
  timestamp: string;
}

export interface BatchSendRequest {
  campaignId: string;
  recipients: SendRecipientItem[];
}

export interface BatchSendResponse {
  success: boolean;
  results: RecipientSendResult[];
  error?: string;
}

export interface AccessVerifyResponse {
  required: boolean;
  valid: boolean;
  providerConfigured: boolean;
  senderName: string;
  tariffPerSegment?: number;
  currency?: string;
  defaultCountryCode?: string;
}
