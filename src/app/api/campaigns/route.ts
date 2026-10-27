import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { prisma, isDatabaseConfigured, formatPrismaErrorMessage } from '@/lib/prisma';
import { CreateCampaignPayload, CampaignListResponse } from '@/types';
import { MAX_RECIPIENTS_PER_CAMPAIGN } from '@/lib/parser';
import { CampaignStatus, Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  // Authorization check
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

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim();
    const status = searchParams.get('status')?.trim() as CampaignStatus | undefined;
    const startDate = searchParams.get('startDate')?.trim();
    const endDate = searchParams.get('endDate')?.trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const skip = (page - 1) * pageSize;

    const where: Prisma.CampaignWhereInput = {};

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    if (status && Object.values(CampaignStatus).includes(status)) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // End of day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.campaign.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    const response: CampaignListResponse = {
      campaigns: campaigns.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        startedAt: c.startedAt ? c.startedAt.toISOString() : null,
        completedAt: c.completedAt ? c.completedAt.toISOString() : null,
      })),
      total,
      page,
      pageSize,
      totalPages,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const cleanMsg = formatPrismaErrorMessage(err);
    return NextResponse.json(
      { error: cleanMsg },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  // Authorization check
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

  let body: CreateCampaignPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request payload' },
      { status: 400 }
    );
  }

  const { name, originalFilename, messageTemplate, recipients, estimatedCost } = body;

  if (!name || name.trim().length === 0) {
    return NextResponse.json(
      { error: 'Campaign name is required' },
      { status: 400 }
    );
  }

  if (!messageTemplate || messageTemplate.trim().length === 0) {
    return NextResponse.json(
      { error: 'Message template is required' },
      { status: 400 }
    );
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json(
      { error: 'At least one recipient is required' },
      { status: 400 }
    );
  }

  if (recipients.length > MAX_RECIPIENTS_PER_CAMPAIGN) {
    return NextResponse.json(
      {
        error: `Exceeded campaign limit of ${MAX_RECIPIENTS_PER_CAMPAIGN} recipients (received ${recipients.length}).`,
      },
      { status: 400 }
    );
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        name: name.trim(),
        originalFilename: originalFilename || null,
        messageTemplate,
        status: 'DRAFT',
        totalRecipients: recipients.length,
        validRecipients: recipients.length,
        pendingCount: recipients.length,
        submittedCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        estimatedCost: estimatedCost ?? null,
        recipients: {
          createMany: {
            data: recipients.map((r) => ({
              recipientName: r.name ? r.name.trim() : null,
              phone: r.phone.trim(),
              maskedPhone: r.maskedPhone || r.phone.trim(),
              status: 'PENDING',
            })),
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        campaign: {
          ...campaign,
          createdAt: campaign.createdAt.toISOString(),
          updatedAt: campaign.updatedAt.toISOString(),
          startedAt: campaign.startedAt ? campaign.startedAt.toISOString() : null,
          completedAt: campaign.completedAt ? campaign.completedAt.toISOString() : null,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const cleanMsg = formatPrismaErrorMessage(err);
    return NextResponse.json(
      { error: cleanMsg },
      { status: 500 }
    );
  }
}
