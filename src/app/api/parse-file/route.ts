import { NextRequest, NextResponse } from 'next/server';
import { parseCustomerFile } from '@/lib/parser';
import { ColumnMapping } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const mappingJson = formData.get('mapping') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const filename = file.name || 'uploaded.xlsx';
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let customMapping: ColumnMapping | undefined;
    if (mappingJson) {
      try {
        customMapping = JSON.parse(mappingJson);
      } catch {
        // ignore invalid custom mapping json
      }
    }

    const result = await parseCustomerFile(buffer, filename, customMapping);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to parse file';
    return NextResponse.json(
      { error: `File processing failed: ${msg}` },
      { status: 500 }
    );
  }
}
