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

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
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

    const headers = [
      'Recipient Name',
      'Masked Phone',
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
      `"${r.status}"`,
      `"${r.providerMessageId || ''}"`,
      `"${r.submittedAt ? r.submittedAt.toISOString() : ''}"`,
      `"${r.deliveredAt ? r.deliveredAt.toISOString() : ''}"`,
      `"${(r.failureReason || '').replace(/"/g, '""')}"`,
      r.retryCount,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const safeName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="campaign_${safeName}_results.csv"`,
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
