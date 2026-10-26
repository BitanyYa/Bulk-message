export interface AfroMessageSendOptions {
  sender?: string;
  from?: string;
  callback?: string;
  timeoutMs?: number;
}

export interface AfroMessageSendResult {
  success: boolean;
  status: 'submitted' | 'failed' | 'timeout_unconfirmed';
  messageId?: string;
  error?: string;
  rawStatus?: string;
}

export interface AfroMessageBulkResult {
  success: boolean;
  campaignId?: string;
  error?: string;
  message?: string;
}

export interface AfroMessageBalance {
  balance: string;
  estimatedMessages: string;
}

export class AfroMessageClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultSender?: string;
  private readonly defaultIdentifier?: string;
  private readonly defaultCallback?: string;

  constructor(config?: {
    apiKey?: string;
    baseUrl?: string;
    sender?: string;
    from?: string;
    callback?: string;
  }) {
    this.apiKey = config?.apiKey || process.env.AFROMESSAGE_API_KEY || process.env.AFROMESSAGE_TOKEN || '';
    this.baseUrl = config?.baseUrl || process.env.AFROMESSAGE_BASE_URL || 'https://api.afromessage.com';
    this.defaultSender = config?.sender || process.env.AFROMESSAGE_SENDER_NAME;
    this.defaultIdentifier = config?.from || process.env.AFROMESSAGE_IDENTIFIER_ID;
    this.defaultCallback = config?.callback || process.env.AFROMESSAGE_CALLBACK_URL;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  public getSenderName(): string {
    return this.defaultSender || 'AfroMessage';
  }

  /**
   * Sends a single SMS message via AfroMessage POST /api/send.
   */
  async sendSms(
    to: string,
    message: string,
    options?: AfroMessageSendOptions
  ): Promise<AfroMessageSendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'failed',
        error: 'AfroMessage API key is not configured on the server.',
      };
    }

    const timeoutMs = options?.timeoutMs || 12000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const payload: Record<string, unknown> = {
      to,
      message,
    };

    const sender = options?.sender || this.defaultSender;
    if (sender) payload.sender = sender;

    const from = options?.from || this.defaultIdentifier;
    if (from) payload.from = from;

    const callback = options?.callback || this.defaultCallback;
    if (callback) payload.callback = callback;

    try {
      const response = await fetch(`${this.baseUrl}/api/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Handle HTTP status errors
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          status: 'failed',
          error: 'AfroMessage authorization failed (Invalid API token or unauthorized sender).',
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          status: 'failed',
          error: 'AfroMessage rate limit reached. Please wait before retrying.',
        };
      }

      let data: {
        acknowledge?: string;
        response?: {
          status?: string;
          message_id?: string;
          errors?: string[];
        };
      };

      try {
        data = await response.json();
      } catch {
        return {
          success: false,
          status: 'failed',
          error: `Provider returned HTTP ${response.status} with non-JSON response.`,
        };
      }

      if (data.acknowledge === 'success' && data.response) {
        return {
          success: true,
          status: 'submitted',
          messageId: data.response.message_id || `msg_${Date.now()}`,
          rawStatus: data.response.status || 'Send in progress...',
        };
      }

      // Check for errors returned in JSON
      const errors = data.response?.errors;
      const errorMsg = Array.isArray(errors) && errors.length > 0
        ? errors.join('; ')
        : 'SMS delivery was rejected by the provider.';

      return {
        success: false,
        status: 'failed',
        error: errorMsg,
      };
    } catch (err: unknown) {
      clearTimeout(timer);

      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort') || err.message.includes('timeout'))) {
        return {
          success: false,
          status: 'timeout_unconfirmed',
          error: `Request timed out after ${timeoutMs / 1000}s while waiting for provider response. Provider status is unconfirmed; do not blindly resend without verification.`,
        };
      }

      const message = err instanceof Error ? err.message : 'Network error communicating with AfroMessage';
      return {
        success: false,
        status: 'failed',
        error: `Network connection failed: ${message}`,
      };
    }
  }

  /**
   * Bulk sends identical message to multiple recipients via POST /api/bulk_send.
   */
  async bulkSendSms(
    to: string[],
    message: string,
    options?: AfroMessageSendOptions
  ): Promise<AfroMessageBulkResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'AfroMessage API key is not configured on the server.',
      };
    }

    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs || 25000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const payload: Record<string, unknown> = {
      to,
      message,
    };

    const sender = options?.sender || this.defaultSender;
    if (sender) payload.sender = sender;

    const from = options?.from || this.defaultIdentifier;
    if (from) payload.from = from;

    const callback = options?.callback || this.defaultCallback;
    if (callback) payload.callback = callback;

    try {
      const response = await fetch(`${this.baseUrl}/api/bulk_send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return { success: false, error: 'AfroMessage authorization failed.' };
        }
        if (response.status === 429) {
          return { success: false, error: 'AfroMessage rate limit reached.' };
        }
      }

      const data = await response.json();
      if (data.acknowledge === 'success' && data.response) {
        return {
          success: true,
          campaignId: data.response.campaign_id,
          message: data.response.message,
        };
      }

      const errors = data.response?.errors;
      const errorMsg = Array.isArray(errors) && errors.length > 0 ? errors.join('; ') : 'Bulk send rejected';
      return {
        success: false,
        error: errorMsg,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : 'Network error during bulk send';
      return {
        success: false,
        error: `Bulk send request failed: ${message}`,
      };
    }
  }

  /**
   * Retrieves account balance and message credit estimation.
   */
  async getBalance(): Promise<AfroMessageBalance | null> {
    if (!this.isConfigured()) return null;

    try {
      const response = await fetch(`${this.baseUrl}/api/balance`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (data.acknowledge === 'success' && data.response) {
        return {
          balance: String(data.response.balance ?? '0'),
          estimatedMessages: String(data.response.estimatedMessages ?? '0'),
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}
