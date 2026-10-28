import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { prisma, isDatabaseConfigured, formatPrismaErrorMessage } from '@/lib/prisma';

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

  let body: { batchId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // optional body
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

    const whereFilter: {
      campaignId: string;
      batchId?: string;
      status: { in: ['FAILED', 'TIMEOUT_UNCONFIRMED'] };
    } = {
      campaignId,
      status: { in: ['FAILED', 'TIMEOUT_UNCONFIRMED'] },
    };

    if (body.batchId) {
      whereFilter.batchId = body.batchId;
    }

    // Strictly select ONLY failed or timeout_unconfirmed recipients
    const failedRecipients = await prisma.campaignRecipient.findMany({
      where: whereFilter,
    });

    if (failedRecipients.length === 0) {
      return NextResponse.json(
        { error: 'No failed or timed-out messages found to retry in this selection.' },
        { status: 400 }
      );
    }

    // Reset their status to PENDING and increment retryCount
    await prisma.campaignRecipient.updateMany({
      where: whereFilter,
      data: {
        status: 'PENDING',
        retryCount: { increment: 1 },
        failureReason: null,
        providerStatus: 'Queued for retry',
      },
    });

    // Update batch if batchId provided
    if (body.batchId) {
      const bCounts = await prisma.campaignRecipient.groupBy({
        by: ['status'],
        where: { batchId: body.batchId },
        _count: { id: true },
      });

      let bSub = 0, bDel = 0, bFail = 0, bPend = 0;
      for (const g of bCounts) {
        if (g.status === 'SUBMITTED') bSub = g._count.id;
        if (g.status === 'DELIVERED') bDel = g._count.id;
        if (g.status === 'FAILED') bFail = g._count.id;
        if (g.status === 'PENDING' || g.status === 'TIMEOUT_UNCONFIRMED') bPend += g._count.id;
      }

      await prisma.campaignBatch.update({
        where: { id: body.batchId },
        data: {
          status: 'SENDING',
          completedAt: null,
          submittedCount: bSub,
          deliveredCount: bDel,
          failedCount: bFail,
          pendingCount: bPend,
        },
      });
    }

    // Recalculate campaign counts
    const counts = await prisma.campaignRecipient.groupBy({
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

    await prisma.campaign.update({
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

    return NextResponse.json({
      success: true,
      message: `Reset ${failedRecipients.length} failed recipient(s) to PENDING for retry.`,
      retriedCount: failedRecipients.length,
    });
  } catch (err: unknown) {
    const cleanMsg = formatPrismaErrorMessage(err);
    return NextResponse.json(
      { error: cleanMsg },
      { status: 500 }
    );
  }
}
