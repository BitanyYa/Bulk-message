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

// ==========================================
// Message Template Types
// ==========================================

export interface MessageTemplateRecord {
  id: string;
  name: string;
  body: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplatePayload {
  name: string;
  body: string;
}

export interface UpdateTemplatePayload {
  name?: string;
  body?: string;
  isArchived?: boolean;
}

// ==========================================
// Persistent Campaign & History Types
// ==========================================

export type DbCampaignStatus =
  | 'DRAFT'
  | 'SENDING'
  | 'COMPLETED'
  | 'PARTIALLY_FAILED'
  | 'FAILED'
  | 'INTERRUPTED';

export type DbRecipientStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'DELIVERED'
  | 'FAILED'
  | 'TIMEOUT_UNCONFIRMED';

export interface CampaignBatchRecord {
  id: string;
  campaignId: string;
  batchNumber: number;
  name?: string | null;
  messageText: string;
  status: DbCampaignStatus;
  totalRecipients: number;
  validRecipients: number;
  submittedCount: number;
  deliveredCount: number;
  failedCount: number;
  pendingCount: number;
  estimatedCost?: number | null;
  actualCost?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  recipients?: CampaignRecipientRecord[];
}

export interface CampaignRecord {
  id: string;
  name: string;
  originalFilename?: string | null;
  messageTemplate: string;
  status: DbCampaignStatus;
  isArchived?: boolean;
  totalRecipients: number;
  validRecipients: number;
  submittedCount: number;
  deliveredCount: number;
  failedCount: number;
  pendingCount: number;
  estimatedCost?: number | null;
  actualCost?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  recipients?: CampaignRecipientRecord[];
  batches?: CampaignBatchRecord[];
  batchCount?: number;
  lastBatchActivity?: string | null;
}

export interface CampaignRecipientRecord {
  id: string;
  campaignId: string;
  batchId?: string | null;
  recipientName?: string | null;
  phone: string;
  maskedPhone: string;
  status: DbRecipientStatus;
  providerMessageId?: string | null;
  submittedAt?: string | null;
  deliveredAt?: string | null;
  failureReason?: string | null;
  retryCount: number;
  providerStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardMetrics {
  totalCampaigns: number;
  totalRecipients: number;
  totalSubmitted: number;
  totalDelivered: number;
  totalFailed: number;
  totalPending: number;
  recentCampaigns: CampaignRecord[];
  warning?: string;
}

export interface CreateCampaignPayload {
  name: string;
  originalFilename?: string;
  messageTemplate: string;
  estimatedCost?: number;
  recipients: Array<{
    name: string;
    phone: string;
    maskedPhone: string;
  }>;
}

export interface AddBatchPayload {
  name?: string;
  messageText?: string;
  estimatedCost?: number;
  recipients: Array<{
    name: string;
    phone: string;
    maskedPhone: string;
  }>;
}

export interface CampaignListResponse {
  campaigns: CampaignRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

