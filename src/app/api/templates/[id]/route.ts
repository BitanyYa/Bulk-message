import { NextRequest, NextResponse } from 'next/server';
import { validateRequestAccess } from '@/lib/auth';
import { prisma, isDatabaseConfigured, formatPrismaErrorMessage } from '@/lib/prisma';
import { UpdateTemplatePayload, MessageTemplateRecord } from '@/types';
import { findUnresolvedPlaceholders } from '@/lib/sms';

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
    const template = await prisma.messageTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const formatted: MessageTemplateRecord = {
      id: template.id,
      name: template.name,
      body: template.body,
      isArchived: template.isArchived,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };

    return NextResponse.json(formatted);
  } catch (err: unknown) {
    const cleanMsg = formatPrismaErrorMessage(err);
    return NextResponse.json({ error: cleanMsg }, { status: 500 });
  }
}

export async function PUT(
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

  let body: UpdateTemplatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request payload' },
      { status: 400 }
    );
  }

  const updateData: { name?: string; body?: string; isArchived?: boolean } = {};

  if (body.name !== undefined) {
    if (body.name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Template name cannot be empty' },
        { status: 400 }
      );
    }
    updateData.name = body.name.trim();
  }

  if (body.body !== undefined) {
    if (body.body.trim().length === 0) {
      return NextResponse.json(
        { error: 'Template message body cannot be empty' },
        { status: 400 }
      );
    }

    const unresolved = findUnresolvedPlaceholders(body.body);
    if (unresolved.length > 0) {
      return NextResponse.json(
        {
          error: `Unsupported placeholder(s): ${unresolved.join(', ')}. Only {{name}} is supported.`,
        },
        { status: 400 }
      );
    }
    updateData.body = body.body.trim();
  }

  if (body.isArchived !== undefined) {
    updateData.isArchived = Boolean(body.isArchived);
  }

  try {
    const existing = await prisma.messageTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const updated = await prisma.messageTemplate.update({
      where: { id },
      data: updateData,
    });

    const formatted: MessageTemplateRecord = {
      id: updated.id,
      name: updated.name,
      body: updated.body,
      isArchived: updated.isArchived,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    return NextResponse.json({ success: true, template: formatted });
  } catch (err: unknown) {
    const cleanMsg = formatPrismaErrorMessage(err);
    return NextResponse.json({ error: cleanMsg }, { status: 500 });
  }
}

export async function DELETE(
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
    const existing = await prisma.messageTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Soft delete by marking as archived
    const archived = await prisma.messageTemplate.update({
      where: { id },
      data: { isArchived: true },
    });

    return NextResponse.json({
      success: true,
      message: `Template "${archived.name}" archived successfully`,
    });
  } catch (err: unknown) {
    const cleanMsg = formatPrismaErrorMessage(err);
    return NextResponse.json({ error: cleanMsg }, { status: 500 });
  }
}
