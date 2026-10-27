import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { prisma, isDatabaseConfigured, formatPrismaErrorMessage } from '@/lib/prisma';
import { DashboardMetrics } from '@/types';

export async function GET(req: NextRequest) {
  const auth = validateRequestAccess(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.reason || 'Unauthorized' },
      { status: 401 }
    );
  }

  // Graceful response if database is not yet configured or reachable
  if (!isDatabaseConfigured()) {
    const emptyMetrics: DashboardMetrics = {
      totalCampaigns: 0,
      totalRecipients: 0,
      totalSubmitted: 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalPending: 0,
      recentCampaigns: [],
      warning: 'Database is not yet configured. Please set DATABASE_URL in .env.local.',
    };
    return NextResponse.json(emptyMetrics);
  }

  try {
    const totalCampaigns = await prisma.campaign.count();
    const recipientGroups = await prisma.campaignRecipient.groupBy({
      by: ['status'],
      _count: true,
    });
    const recentCampaigns = await prisma.campaign.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    let totalRecipients = 0;
    let totalSubmitted = 0;
    let totalDelivered = 0;
    let totalFailed = 0;
    let totalPending = 0;

    for (const g of recipientGroups) {
      totalRecipients += g._count;
      if (g.status === 'SUBMITTED') totalSubmitted += g._count;
      else if (g.status === 'DELIVERED') totalDelivered += g._count;
      else if (g.status === 'FAILED') totalFailed += g._count;
      else if (g.status === 'PENDING' || g.status === 'TIMEOUT_UNCONFIRMED') totalPending += g._count;
    }

    const metrics: DashboardMetrics = {
      totalCampaigns,
      totalRecipients,
      totalSubmitted,
      totalDelivered,
      totalFailed,
      totalPending,
      recentCampaigns: recentCampaigns.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        startedAt: c.startedAt ? c.startedAt.toISOString() : null,
        completedAt: c.completedAt ? c.completedAt.toISOString() : null,
      })),
    };

    return NextResponse.json(metrics);
  } catch (err: unknown) {
    const cleanMsg = formatPrismaErrorMessage(err);
    const fallbackMetrics: DashboardMetrics = {
      totalCampaigns: 0,
      totalRecipients: 0,
      totalSubmitted: 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalPending: 0,
      recentCampaigns: [],
      warning: cleanMsg,
    };
    return NextResponse.json(fallbackMetrics);
  }
}
