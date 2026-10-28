import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { prisma, isDatabaseConfigured } from '@/lib/prisma';
import { AfroMessageClient } from '@/lib/afromessage';
import { personalizeMessage } from '@/lib/sms';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = validateRequestAccess(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.reason || 'Unauthorized' },
      { status: 401 }
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'Database is not configured. Please set DATABASE_URL.' },
      { status: 503 }
    );
  }

  const { id: campaignId } = await context.params;

  let body: { recipientIds?: string[]; batchId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is acceptable; will fetch pending recipients
  }

  const client = new AfroMessageClient();
  if (!client.isConfigured()) {
    return NextResponse.json(
      { error: 'AfroMessage API key is not configured on the server.' },
      { status: 503 }
    );
  }

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    if (campaign.isArchived) {
      return NextResponse.json(
        { error: 'This campaign is closed/archived. Reopen it before sending messages.' },
        { status: 400 }
      );
    }

    let targetBatch = null;
    if (body.batchId) {
      targetBatch = await prisma.campaignBatch.findUnique({
        where: { id: body.batchId },
      });
      if (!targetBatch || targetBatch.campaignId !== campaignId) {
        return NextResponse.json(
          { error: 'Specified batch not found in this campaign' },
          { status: 404 }
        );
      }
    }

    // Find target recipients
    const whereClause: {
      campaignId: string;
      batchId?: string;
      id?: { in: string[] };
      status?: 'PENDING';
    } = {
      campaignId,
    };

    if (body.batchId) {
      whereClause.batchId = body.batchId;
    }

    if (body.recipientIds && body.recipientIds.length > 0) {
      whereClause.id = { in: body.recipientIds };
    } else {
      whereClause.status = 'PENDING';
    }

    const recipientsToSend = await prisma.campaignRecipient.findMany({
      where: whereClause,
      take: 25, // Micro-batch size to guarantee fast serverless completion
      orderBy: { createdAt: 'asc' },
    });

    if (recipientsToSend.length === 0) {
      // No more recipients to send in this batch
      return NextResponse.json({
        success: true,
        message: 'No pending recipients to send',
        batchProcessed: 0,
        campaignStatus: campaign.status,
      });
    }

    // Update campaign to SENDING if currently DRAFT
    if (campaign.status === 'DRAFT' || !campaign.startedAt) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'SENDING',
          startedAt: campaign.startedAt ?? new Date(),
        },
      });
    }

    // Update batch to SENDING if targetBatch is DRAFT
    if (targetBatch && (targetBatch.status === 'DRAFT' || !targetBatch.startedAt)) {
      await prisma.campaignBatch.update({
        where: { id: targetBatch.id },
        data: {
          status: 'SENDING',
          startedAt: targetBatch.startedAt ?? new Date(),
        },
      });
    }

    // Optional callback URL
    let callbackUrl = process.env.AFROMESSAGE_CALLBACK_URL;
    if (!callbackUrl && process.env.AFROMESSAGE_WEBHOOK_SECRET) {
      const host = req.headers.get('host') || 'localhost:3000';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      callbackUrl = `${protocol}://${host}/api/webhooks/afromessage?secret=${process.env.AFROMESSAGE_WEBHOOK_SECRET}`;
    }

    const templateToUse = targetBatch?.messageText || campaign.messageTemplate;

    // Process chunk of 5 concurrent requests
    const CONCURRENCY = 5;
    const results: Array<{
      id: string;
      status: 'SUBMITTED' | 'FAILED' | 'TIMEOUT_UNCONFIRMED';
      messageId?: string;
      error?: string;
    }> = [];

    for (let i = 0; i < recipientsToSend.length; i += CONCURRENCY) {
      const chunk = recipientsToSend.slice(i, i + CONCURRENCY);

      const chunkPromises = chunk.map(async (recipient) => {
        const personalizedMsg = personalizeMessage(
          templateToUse,
          recipient.recipientName || ''
        );

        const sendRes = await client.sendSms(recipient.phone, personalizedMsg, {
          callback: callbackUrl,
        });

        if (sendRes.status === 'submitted') {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'SUBMITTED',
              providerMessageId: sendRes.messageId || null,
              providerStatus: sendRes.rawStatus || 'Send in progress...',
              submittedAt: new Date(),
              failureReason: null,
            },
          });

          return {
            id: recipient.id,
            status: 'SUBMITTED' as const,
            messageId: sendRes.messageId,
          };
        } else if (sendRes.status === 'timeout_unconfirmed') {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'TIMEOUT_UNCONFIRMED',
              failureReason: sendRes.error || 'Provider response timeout',
            },
          });

          return {
            id: recipient.id,
            status: 'TIMEOUT_UNCONFIRMED' as const,
            error: sendRes.error,
          };
        } else {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'FAILED',
              failureReason: sendRes.error || 'Sending failed',
            },
          });

          return {
            id: recipient.id,
            status: 'FAILED' as const,
            error: sendRes.error,
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      if (i + CONCURRENCY < recipientsToSend.length) {
        await sleep(40);
      }
    }

    // Update batch aggregates if targetBatch was specified
    if (targetBatch) {
      const [batchCounts, batchRemainingPending] = await Promise.all([
        prisma.campaignRecipient.groupBy({
          by: ['status'],
          where: { batchId: targetBatch.id },
          _count: { id: true },
        }),
        prisma.campaignRecipient.count({
          where: { batchId: targetBatch.id, status: 'PENDING' },
        }),
      ]);

      let bSubmitted = 0;
      let bDelivered = 0;
      let bFailed = 0;
      let bPending = 0;

      for (const group of batchCounts) {
        if (group.status === 'SUBMITTED') bSubmitted = group._count.id;
        if (group.status === 'DELIVERED') bDelivered = group._count.id;
        if (group.status === 'FAILED') bFailed = group._count.id;
        if (group.status === 'PENDING' || group.status === 'TIMEOUT_UNCONFIRMED') {
          bPending += group._count.id;
        }
      }

      let bFinalStatus: 'SENDING' | 'COMPLETED' | 'PARTIALLY_FAILED' = 'SENDING';
      let bCompletedAt: Date | null = null;

      if (batchRemainingPending === 0) {
        bCompletedAt = new Date();
        bFinalStatus = bFailed > 0 ? 'PARTIALLY_FAILED' : 'COMPLETED';
      }

      await prisma.campaignBatch.update({
        where: { id: targetBatch.id },
        data: {
          submittedCount: bSubmitted,
          deliveredCount: bDelivered,
          failedCount: bFailed,
          pendingCount: bPending,
          status: bFinalStatus,
          completedAt: bCompletedAt,
        },
      });
    }

    // Recalculate parent campaign aggregate counters
    const [counts, remainingPending] = await Promise.all([
      prisma.campaignRecipient.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: { id: true },
      }),
      prisma.campaignRecipient.count({
        where: { campaignId, status: 'PENDING' },
      }),
    ]);

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

    let finalStatus: 'SENDING' | 'COMPLETED' | 'PARTIALLY_FAILED' = 'SENDING';
    let completedAt: Date | null = null;

    if (remainingPending === 0) {
      completedAt = new Date();
      finalStatus = failedCount > 0 ? 'PARTIALLY_FAILED' : 'COMPLETED';
    }

    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        submittedCount,
        deliveredCount,
        failedCount,
        pendingCount,
        status: finalStatus,
        completedAt,
      },
    });

    return NextResponse.json({
      success: true,
      batchProcessed: recipientsToSend.length,
      remainingPending,
      results,
      campaign: {
        ...updatedCampaign,
        createdAt: updatedCampaign.createdAt.toISOString(),
        updatedAt: updatedCampaign.updatedAt.toISOString(),
        startedAt: updatedCampaign.startedAt?.toISOString() ?? null,
        completedAt: updatedCampaign.completedAt?.toISOString() ?? null,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Batch sending execution failed';
    return NextResponse.json(
      { error: `Sending execution error: ${msg}` },
      { status: 500 }
    );
  }
}
