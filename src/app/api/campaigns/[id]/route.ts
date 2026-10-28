import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { prisma, isDatabaseConfigured, formatPrismaErrorMessage } from '@/lib/prisma';
import { findUnresolvedPlaceholders } from '@/lib/sms';
import { UpdateCampaignPayload } from '@/types';

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

  let body: UpdateCampaignPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request payload' },
      { status: 400 }
    );
  }

  if (body.isArchived === undefined && body.messageTemplate === undefined) {
    return NextResponse.json(
      { error: 'At least one field (messageTemplate or isArchived) must be provided' },
      { status: 400 }
    );
  }

  try {
    const existingCampaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isArchived: true,
        messageTemplate: true,
        status: true,
      },
    });

    if (!existingCampaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    const dataToUpdate: { isArchived?: boolean; messageTemplate?: string } = {};

    // 1. Archival / Close / Reopen handling
    if (body.isArchived !== undefined) {
      dataToUpdate.isArchived = Boolean(body.isArchived);
    }

    // 2. Message template editing
    if (body.messageTemplate !== undefined) {
      // Determine if campaign will remain or become closed
      const willBeArchived =
        dataToUpdate.isArchived !== undefined
          ? dataToUpdate.isArchived
          : existingCampaign.isArchived;

      if (willBeArchived) {
        return NextResponse.json(
          {
            error:
              'Cannot edit message for a closed/archived campaign. Please reopen the campaign first.',
          },
          { status: 400 }
        );
      }

      if (typeof body.messageTemplate !== 'string') {
        return NextResponse.json(
          { error: 'messageTemplate must be a string' },
          { status: 400 }
        );
      }

      const trimmedMessage = body.messageTemplate.trim();
      if (!trimmedMessage) {
        return NextResponse.json(
          { error: 'Campaign message cannot be empty' },
          { status: 400 }
        );
      }

      if (trimmedMessage.length > 1000) {
        return NextResponse.json(
          { error: 'Campaign message exceeds the 1,000 character limit' },
          { status: 400 }
        );
      }

      const invalidPlaceholders = findUnresolvedPlaceholders(trimmedMessage);
      if (invalidPlaceholders.length > 0) {
        return NextResponse.json(
          {
            error: `Unsupported placeholder(s): ${invalidPlaceholders.join(
              ', '
            )}. Only {{name}} is supported.`,
          },
          { status: 400 }
        );
      }

      dataToUpdate.messageTemplate = trimmedMessage;
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        name: true,
        messageTemplate: true,
        isArchived: true,
        updatedAt: true,
      },
    });

    let message = 'Campaign updated successfully';
    if (body.messageTemplate !== undefined && body.isArchived !== undefined) {
      message = 'Campaign message and status updated successfully';
    } else if (body.messageTemplate !== undefined) {
      message = 'Campaign message updated successfully';
    } else if (body.isArchived !== undefined) {
      message = updated.isArchived
        ? 'Campaign closed/archived successfully'
        : 'Campaign reopened successfully';
    }

    return NextResponse.json({
      success: true,
      campaign: {
        ...updated,
        updatedAt: updated.updatedAt.toISOString(),
      },
      isArchived: updated.isArchived,
      messageTemplate: updated.messageTemplate,
      message,
    });
  } catch (err: unknown) {
    const cleanMsg = formatPrismaErrorMessage(err);
    return NextResponse.json(
      { error: cleanMsg },
      { status: 500 }
    );
  }
}

export const PUT = PATCH;
