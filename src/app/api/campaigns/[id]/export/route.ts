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

  const { id: campaignId } = await context.params;
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get('batchId')?.trim();

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        batches: true,
        recipients: {
          where: batchId ? { batchId } : undefined,
          include: {
            batch: {
              select: { batchNumber: true, name: true },
            },
          },
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

    const headers = [
      'Recipient Name',
      'Masked Phone',
      'Batch',
      'Status',
      'Provider Message ID',
      'Submitted At',
      'Delivered At',
      'Failure Reason',
      'Retry Count',
    ];

    const rows = campaign.recipients.map((r) => [
      `"${(r.recipientName || 'Customer').replace(/"/g, '""')}"`,
      `"${r.maskedPhone}"`,
      `"${r.batch?.name || (r.batch?.batchNumber ? `Batch ${r.batch.batchNumber}` : 'Batch 1')}"`,
      `"${r.status}"`,
      `"${r.providerMessageId || ''}"`,
      `"${r.submittedAt ? r.submittedAt.toISOString() : ''}"`,
      `"${r.deliveredAt ? r.deliveredAt.toISOString() : ''}"`,
      `"${(r.failureReason || '').replace(/"/g, '""')}"`,
      r.retryCount,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const safeName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    const targetBatch = batchId ? campaign.batches.find((b) => b.id === batchId) : null;
    const filename = targetBatch
      ? `campaign_${safeName}_batch_${targetBatch.batchNumber}_results.csv`
      : `campaign_${safeName}_results.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Export failed';
    return NextResponse.json(
      { error: `Database error during export: ${msg}` },
      { status: 500 }
    );
  }
}
