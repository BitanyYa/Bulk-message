import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseConfigured } from '@/lib/prisma';

async function processCallback(req: NextRequest) {
  // 1. Verify webhook secret if configured
  const expectedSecret = process.env.AFROMESSAGE_WEBHOOK_SECRET;
  const { searchParams } = new URL(req.url);
  const providedSecret = searchParams.get('secret');

  if (expectedSecret && providedSecret !== expectedSecret) {
    return NextResponse.json(
      { error: 'Invalid or missing webhook verification secret' },
      { status: 401 }
    );
  }

  // 2. Extract message_id and status from query params or body
  let messageId = searchParams.get('message_id') || searchParams.get('id');
  let status = searchParams.get('status') || searchParams.get('state');

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        if (!messageId) messageId = body.message_id || body.id;
        if (!status) status = body.status || body.state;
      }
    } catch {
      // Body might be empty or form-encoded; continue with query params
    }
  }

  if (!messageId) {
    return NextResponse.json(
      { error: 'Missing required parameter: message_id' },
      { status: 400 }
    );
  }

  if (!isDatabaseConfigured()) {
    // Database not configured yet, acknowledge provider safely
    return NextResponse.json({
      acknowledge: 'success',
      note: 'Database unconfigured; delivery receipt ignored',
    });
  }

  try {
    // 3. Find matching recipient in database
    const recipient = await prisma.campaignRecipient.findFirst({
      where: { providerMessageId: messageId },
      include: { campaign: true },
    });

    if (!recipient) {
      // Return 200 so provider does not repeatedly spam retries for unknown messages
      return NextResponse.json({
        acknowledge: 'success',
        note: `Message ID ${messageId} not found in database records`,
      });
    }

    const rawStatus = (status || '').toLowerCase();
    const isDelivered =
      rawStatus.includes('deliver') ||
      rawStatus.includes('success') ||
      rawStatus.includes('sent');
    const isFailed =
      rawStatus.includes('fail') ||
      rawStatus.includes('reject') ||
      rawStatus.includes('undelivered') ||
      rawStatus.includes('expired');

    const updateData: {
      status?: 'DELIVERED' | 'FAILED';
      deliveredAt?: Date;
      failureReason?: string;
      providerStatus?: string;
    } = {
      providerStatus: status || undefined,
    };

    if (isDelivered && recipient.status !== 'DELIVERED') {
      updateData.status = 'DELIVERED';
      updateData.deliveredAt = new Date();
    } else if (isFailed && recipient.status !== 'FAILED') {
      updateData.status = 'FAILED';
      updateData.failureReason = status || 'Carrier delivery rejected';
    }

    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: updateData,
    });

    // 4. Update parent campaign counts
    const counts = await prisma.campaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId: recipient.campaignId },
      _count: { id: true },
    });

    let submittedCount = 0;
    let deliveredCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    for (const group of counts) {
      if (group.status === 'SUBMITTED') submittedCount = group._count.id;
      if (group.status === 'DELIVERED') deliveredCount = group._count.id;
      if (group.status === 'FAILED') failedCount = group._count.id;
      if (group.status === 'PENDING' || group.status === 'TIMEOUT_UNCONFIRMED') {
        pendingCount += group._count.id;
      }
    }

    await prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: {
        submittedCount,
        deliveredCount,
        failedCount,
        pendingCount,
      },
    });

    return NextResponse.json({
      acknowledge: 'success',
      message: 'Delivery receipt processed successfully',
      recipientId: recipient.id,
      updatedStatus: updateData.status || recipient.status,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Webhook error';
    return NextResponse.json(
      { error: `Database error during webhook: ${msg}` },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return processCallback(req);
}

export async function POST(req: NextRequest) {
  return processCallback(req);
}
