import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { prisma, isDatabaseConfigured } from '@/lib/prisma';

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

    // Strictly select ONLY failed or timeout_unconfirmed recipients
    const failedRecipients = await prisma.campaignRecipient.findMany({
      where: {
        campaignId,
        status: { in: ['FAILED', 'TIMEOUT_UNCONFIRMED'] },
      },
    });

    if (failedRecipients.length === 0) {
      return NextResponse.json(
        { error: 'No failed or timed-out messages found to retry in this campaign.' },
        { status: 400 }
      );
    }

    // Reset their status to PENDING and increment retryCount
    await prisma.$transaction(async (tx) => {
      await tx.campaignRecipient.updateMany({
        where: {
          campaignId,
          status: { in: ['FAILED', 'TIMEOUT_UNCONFIRMED'] },
        },
        data: {
          status: 'PENDING',
          retryCount: { increment: 1 },
          failureReason: null,
          providerStatus: 'Queued for retry',
        },
      });

      // Recalculate campaign counts
      const counts = await tx.campaignRecipient.groupBy({
        by: ['status'],
        where: { campaignId },
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

      await tx.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'SENDING',
          completedAt: null,
          submittedCount,
          deliveredCount,
          failedCount,
          pendingCount,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: `Reset ${failedRecipients.length} failed recipient(s) to PENDING for retry.`,
      retriedCount: failedRecipients.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Retry failed';
    return NextResponse.json(
      { error: `Database error during retry: ${msg}` },
      { status: 500 }
    );
  }
}
