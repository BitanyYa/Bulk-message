import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { prisma, isDatabaseConfigured } from '@/lib/prisma';
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
    };
    return NextResponse.json(emptyMetrics);
  }

  try {
    const [
      totalCampaigns,
      totalRecipients,
      totalSubmitted,
      totalDelivered,
      totalFailed,
      totalPending,
      recentCampaigns,
    ] = await Promise.all([
      prisma.campaign.count(),
      prisma.campaignRecipient.count(),
      prisma.campaignRecipient.count({ where: { status: 'SUBMITTED' } }),
      prisma.campaignRecipient.count({ where: { status: 'DELIVERED' } }),
      prisma.campaignRecipient.count({ where: { status: 'FAILED' } }),
      prisma.campaignRecipient.count({
        where: { status: { in: ['PENDING', 'TIMEOUT_UNCONFIRMED'] } },
      }),
      prisma.campaign.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

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
    const msg = err instanceof Error ? err.message : 'Dashboard metrics error';
    return NextResponse.json(
      { error: `Database error: ${msg}` },
      { status: 500 }
    );
  }
}
