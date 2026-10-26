import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { prisma, isDatabaseConfigured } from '@/lib/prisma';

export async function GET(
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

  const { id } = await context.params;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        recipients: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...campaign,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      startedAt: campaign.startedAt ? campaign.startedAt.toISOString() : null,
      completedAt: campaign.completedAt ? campaign.completedAt.toISOString() : null,
      recipients: campaign.recipients.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
        deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json(
      { error: `Failed to load campaign: ${msg}` },
      { status: 500 }
    );
  }
}
