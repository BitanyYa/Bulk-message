import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { prisma, isDatabaseConfigured, formatPrismaErrorMessage } from '@/lib/prisma';
import { CreateTemplatePayload, MessageTemplateRecord } from '@/types';
import { findUnresolvedPlaceholders } from '@/lib/sms';
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
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
    const status = searchParams.get('status')?.trim(); // 'active' | 'archived' | 'all'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const skip = (page - 1) * pageSize;

    const where: Prisma.MessageTemplateWhereInput = {};

    if (status === 'archived') {
      where.isArchived = true;
    } else if (status === 'all') {
      // no isArchived filter
    } else {
      // Default to active
      where.isArchived = false;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [templates, total] = await Promise.all([
      prisma.messageTemplate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.messageTemplate.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    const formatted: MessageTemplateRecord[] = templates.map((t) => ({
      id: t.id,
      name: t.name,
      body: t.body,
      isArchived: t.isArchived,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      templates: formatted,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err: unknown) {
    const cleanMsg = formatPrismaErrorMessage(err);
    return NextResponse.json({ error: cleanMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

  let body: CreateTemplatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request payload' },
      { status: 400 }
    );
  }

  const { name, body: templateBody } = body;

  if (!name || name.trim().length === 0) {
    return NextResponse.json(
      { error: 'Template name is required' },
      { status: 400 }
    );
  }

  if (!templateBody || templateBody.trim().length === 0) {
    return NextResponse.json(
      { error: 'Template message body is required' },
      { status: 400 }
    );
  }

  // Validate placeholders
  const unresolved = findUnresolvedPlaceholders(templateBody);
  if (unresolved.length > 0) {
    return NextResponse.json(
      {
        error: `Unsupported placeholder(s): ${unresolved.join(', ')}. Only {{name}} is supported.`,
      },
      { status: 400 }
    );
  }

  try {
    const template = await prisma.messageTemplate.create({
      data: {
        name: name.trim(),
        body: templateBody.trim(),
        isArchived: false,
      },
    });

    const formatted: MessageTemplateRecord = {
      id: template.id,
      name: template.name,
      body: template.body,
      isArchived: template.isArchived,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };

    return NextResponse.json({ success: true, template: formatted }, { status: 201 });
  } catch (err: unknown) {
    const cleanMsg = formatPrismaErrorMessage(err);
    return NextResponse.json({ error: cleanMsg }, { status: 500 });
  }
}
