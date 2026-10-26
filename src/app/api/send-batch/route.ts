import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { AfroMessageClient } from '@/lib/afromessage';
import { maskPhoneNumber, normalizePhoneNumber } from '@/lib/phone';
import { findUnresolvedPlaceholders } from '@/lib/sms';
import { BatchSendRequest, BatchSendResponse, RecipientSendResult } from '@/types';
import { MAX_RECIPIENTS_PER_CAMPAIGN } from '@/lib/parser';

// Helper to chunk array
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Sleep helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: NextRequest) {
  // 1. Authorization check
  const auth = validateRequestAccess(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, error: auth.reason || 'Unauthorized' },
      { status: 401 }
    );
  }

  // 2. Parse JSON body
  let body: BatchSendRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON request payload' },
      { status: 400 }
    );
  }

  const { recipients } = body;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Recipient list cannot be empty' },
      { status: 400 }
    );
  }

  if (recipients.length > MAX_RECIPIENTS_PER_CAMPAIGN) {
    return NextResponse.json(
      {
        success: false,
        error: `Exceeded campaign limit of ${MAX_RECIPIENTS_PER_CAMPAIGN} recipients (received ${recipients.length}).`,
      },
      { status: 400 }
    );
  }

  const client = new AfroMessageClient();

  if (!client.isConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: 'AfroMessage credentials are not configured on the server. Please set AFROMESSAGE_API_KEY in environment variables.',
      },
      { status: 503 }
    );
  }

  const results: RecipientSendResult[] = [];

  // Concurrency limit of 5 to protect AfroMessage API rate limits and connection pooling
  const CONCURRENCY = 5;
  const chunks = chunkArray(recipients, CONCURRENCY);

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];

    const chunkPromises = chunk.map(async (item): Promise<RecipientSendResult> => {
      const masked = maskPhoneNumber(item.phone);

      // Validate phone number
      const phoneVal = normalizePhoneNumber(item.phone);
      if (!phoneVal.isValid) {
        return {
          recipientId: item.recipientId,
          name: item.name,
          phone: item.phone,
          maskedPhone: masked,
          status: 'failed',
          error: phoneVal.error || 'Invalid recipient phone number',
          timestamp: new Date().toISOString(),
        };
      }

      // Validate message content
      if (!item.message || item.message.trim().length === 0) {
        return {
          recipientId: item.recipientId,
          name: item.name,
          phone: phoneVal.normalized,
          maskedPhone: masked,
          status: 'failed',
          error: 'Message content is empty',
          timestamp: new Date().toISOString(),
        };
      }

      // Validate no unresolved placeholders
      const unresolved = findUnresolvedPlaceholders(item.message);
      if (unresolved.length > 0) {
        return {
          recipientId: item.recipientId,
          name: item.name,
          phone: phoneVal.normalized,
          maskedPhone: masked,
          status: 'failed',
          error: `Unresolved placeholders detected: ${unresolved.join(', ')}`,
          timestamp: new Date().toISOString(),
        };
      }

      // Send via AfroMessage
      const sendRes = await client.sendSms(phoneVal.normalized, item.message);

      return {
        recipientId: item.recipientId,
        name: item.name,
        phone: phoneVal.normalized,
        maskedPhone: masked,
        status: sendRes.status,
        messageId: sendRes.messageId,
        error: sendRes.error,
        timestamp: new Date().toISOString(),
      };
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);

    // Minor delay between batches to respect rate limits
    if (c < chunks.length - 1) {
      await sleep(50);
    }
  }

  const responsePayload: BatchSendResponse = {
    success: true,
    results,
  };

  return NextResponse.json(responsePayload);
}
