import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { prisma, isDatabaseConfigured, formatPrismaErrorMessage } from '@/lib/prisma';
import { AddBatchPayload } from '@/types';
import { MAX_RECIPIENTS_PER_CAMPAIGN } from '@/lib/parser';
import { normalizePhoneNumber, maskPhoneNumber } from '@/lib/phone';
import { findUnresolvedPlaceholders } from '@/lib/sms';

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

  let body: AddBatchPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request payload' },
      { status: 400 }
    );
  }

  const { name, messageText, estimatedCost, recipients } = body;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json(
      { error: 'At least one customer recipient is required' },
      { status: 400 }
    );
  }

  // Server-side enforcement of batch limit
  if (recipients.length > MAX_RECIPIENTS_PER_CAMPAIGN) {
    return NextResponse.json(
      {
        error: `Batch limit of ${MAX_RECIPIENTS_PER_CAMPAIGN} recipients exceeded (received ${recipients.length}).`,
      },
      { status: 400 }
    );
  }

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        batches: {
          orderBy: { batchNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    if (campaign.isArchived) {
      return NextResponse.json(
        {
          error:
            'This campaign is closed/archived. You must reopen it before adding new customer batches.',
        },
        { status: 400 }
      );
    }

    if (campaign.status === 'SENDING') {
      return NextResponse.json(
        {
          error:
            'Campaign is currently actively sending messages. Please wait for the current batch to complete before adding new customers.',
        },
        { status: 400 }
      );
    }

    // Determine message text for this batch: use reviewed batch message or fallback to campaign template snapshot
    const batchMessage =
      messageText && messageText.trim().length > 0
        ? messageText.trim()
        : campaign.messageTemplate;

    // Validate placeholders in batch message
    const unresolved = findUnresolvedPlaceholders(batchMessage);
    if (unresolved.length > 0) {
      return NextResponse.json(
        {
          error: `Unsupported placeholder(s): ${unresolved.join(', ')}. Only {{name}} is supported.`,
        },
        { status: 400 }
      );
    }

    // 1. Normalize and deduplicate within incoming batch
    const normalizedIncoming: Array<{
      name: string | null;
      phone: string;
      maskedPhone: string;
    }> = [];
    const seenInBatch = new Set<string>();

    for (const r of recipients) {
      const norm = normalizePhoneNumber(r.phone);
      if (!norm.isValid) continue;

      if (!seenInBatch.has(norm.normalized)) {
        seenInBatch.add(norm.normalized);
        normalizedIncoming.push({
          name: r.name ? r.name.trim() : null,
          phone: norm.normalized,
          maskedPhone: r.maskedPhone || maskPhoneNumber(norm.normalized),
        });
      }
    }

    if (normalizedIncoming.length === 0) {
      return NextResponse.json(
        { error: 'No valid phone numbers found in the uploaded customer list.' },
        { status: 400 }
      );
    }

    // 2. Query existing recipients in this campaign to protect against duplicates
    const incomingPhones = normalizedIncoming.map((r) => r.phone);
    const existingInCampaign = await prisma.campaignRecipient.findMany({
      where: {
        campaignId,
        phone: { in: incomingPhones },
      },
      select: { phone: true },
    });

    const existingPhoneSet = new Set(existingInCampaign.map((e) => e.phone));
    const genuineNewRecipients = normalizedIncoming.filter(
      (r) => !existingPhoneSet.has(r.phone)
    );

    if (genuineNewRecipients.length === 0) {
      return NextResponse.json(
        {
          error:
            'All submitted customers already exist in this campaign. No duplicate SMS will be queued.',
        },
        { status: 400 }
      );
    }

    // 3. Determine next batch number
    const nextBatchNumber =
      campaign.batches.length > 0 ? campaign.batches[0].batchNumber + 1 : 2;

    const batchName = name?.trim() || `Batch ${nextBatchNumber}`;

    // 4. Create CampaignBatch
    const newBatch = await prisma.campaignBatch.create({
      data: {
        campaignId,
        batchNumber: nextBatchNumber,
        name: batchName,
        messageText: batchMessage,
        status: 'DRAFT',
        totalRecipients: genuineNewRecipients.length,
        validRecipients: genuineNewRecipients.length,
        pendingCount: genuineNewRecipients.length,
        submittedCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        estimatedCost: estimatedCost ?? null,
      },
    });

    // 5. Create CampaignRecipient records linked to this batch
    await prisma.campaignRecipient.createMany({
      data: genuineNewRecipients.map((r) => ({
        campaignId,
        batchId: newBatch.id,
        recipientName: r.name,
        phone: r.phone,
        maskedPhone: r.maskedPhone,
        status: 'PENDING',
      })),
    });

    // 6. Recalculate and update parent campaign totals
    const [counts, totalUniqueInCampaign] = await Promise.all([
      prisma.campaignRecipient.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: { id: true },
      }),
      prisma.campaignRecipient.count({
        where: { campaignId },
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

    // Reset campaign status to DRAFT if there are pending messages ready to send
    const campaignStatus = pendingCount > 0 ? 'DRAFT' : campaign.status;

    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        totalRecipients: totalUniqueInCampaign,
        validRecipients: totalUniqueInCampaign,
        pendingCount,
        submittedCount,
        deliveredCount,
        failedCount,
        status: campaignStatus,
      },
    });

    const skippedDuplicates = recipients.length - genuineNewRecipients.length;

    return NextResponse.json(
      {
        success: true,
        batch: {
          ...newBatch,
          createdAt: newBatch.createdAt.toISOString(),
          updatedAt: newBatch.updatedAt.toISOString(),
        },
        addedCount: genuineNewRecipients.length,
        skippedDuplicates,
        campaign: {
          ...updatedCampaign,
          createdAt: updatedCampaign.createdAt.toISOString(),
          updatedAt: updatedCampaign.updatedAt.toISOString(),
          startedAt: updatedCampaign.startedAt?.toISOString() ?? null,
          completedAt: updatedCampaign.completedAt?.toISOString() ?? null,
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
