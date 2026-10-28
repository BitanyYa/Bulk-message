import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { prisma, isDatabaseConfigured, formatPrismaErrorMessage } from '@/lib/prisma';

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
        batches: {
          orderBy: { batchNumber: 'asc' },
        },
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
      batches: campaign.batches.map((b) => ({
        ...b,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        startedAt: b.startedAt ? b.startedAt.toISOString() : null,
        completedAt: b.completedAt ? b.completedAt.toISOString() : null,
      })),
      recipients: campaign.recipients.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
        deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
      })),
    });
  } catch (err: unknown) {
    const cleanMsg = formatPrismaErrorMessage(err);
    return NextResponse.json(
      { error: cleanMsg },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

  let body: { isArchived?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request payload' },
      { status: 400 }
    );
  }

  if (body.isArchived === undefined) {
    return NextResponse.json(
      { error: 'isArchived field is required' },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.campaign.update({
      where: { id },
      data: { isArchived: Boolean(body.isArchived) },
    });

    return NextResponse.json({
      success: true,
      isArchived: updated.isArchived,
      message: updated.isArchived
        ? 'Campaign closed/archived successfully'
        : 'Campaign reopened successfully',
    });
  } catch (err: unknown) {
    const cleanMsg = formatPrismaErrorMessage(err);
    return NextResponse.json(
      { error: cleanMsg },
      { status: 500 }
    );
  }
}
