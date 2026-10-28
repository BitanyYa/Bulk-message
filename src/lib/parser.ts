import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { ColumnMapping, ParseResult, RecipientRecord } from '@/types';
import { maskPhoneNumber, normalizePhoneNumber } from './phone';

const NAME_CANDIDATE_REGEX = /^(customer|client|recipient|contact|full)?\s*name$/i;
const NAME_FALLBACK_REGEX = /(name|customer|client|recipient)/i;

const PHONE_CANDIDATE_REGEX = /^(mobile|phone|telephone|cell)?\s*(number|no\.?|num)?$/i;
const PHONE_FALLBACK_REGEX = /(phone|mobile|cell|tel)/i;

export const MAX_RECIPIENTS_PER_CAMPAIGN = 500;

/**
 * Extracts a clean string value from an ExcelJS cell.
 * Preserves leading zeros and un-evaluates formula objects or rich text.
 */
export function extractCellValue(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) {
    return '';
  }

  // If cell has text formatting or explicit string
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    // If the formatted text is available on the cell (which might contain formatted leading zeros)
    if (cell.text && typeof cell.text === 'string' && cell.text.trim().length > 0) {
      return cell.text.trim();
    }
    return String(value).trim();
  }

  // Handle formula object: { formula: '...', result: '...' }
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined && value.result !== null) {
      return String(value.result).trim();
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text).join('').trim();
    }
    if ('text' in value && typeof (value as { text: unknown }).text === 'string') {
      return String((value as { text: string }).text).trim();
    }
  }

  return String(value).trim();
}

/**
 * Automatically detects column indexes for customer name and phone number.
 */
export function detectColumnMapping(headers: string[]): ColumnMapping | null {
  let nameColumn = '';
  let phoneColumn = '';

  const cleanHeaders = headers.map((h) => h.trim());

  // 1. Exact or strict matches first
  for (const h of cleanHeaders) {
    if (!nameColumn && NAME_CANDIDATE_REGEX.test(h)) {
      nameColumn = h;
    }
    if (!phoneColumn && PHONE_CANDIDATE_REGEX.test(h)) {
      phoneColumn = h;
    }
  }

  // 2. Loose fallback matches if still missing
  if (!nameColumn) {
    for (const h of cleanHeaders) {
      if (NAME_FALLBACK_REGEX.test(h) && h !== phoneColumn) {
        nameColumn = h;
        break;
      }
    }
  }

  if (!phoneColumn) {
    for (const h of cleanHeaders) {
      if (PHONE_FALLBACK_REGEX.test(h) && h !== nameColumn) {
        phoneColumn = h;
        break;
      }
    }
  }

  if (nameColumn && phoneColumn) {
    return { nameColumn, phoneColumn };
  }

  return null;
}

export interface ProcessRowsOptions {
  existingPhones?: Set<string> | string[];
  maxLimit?: number;
}

/**
 * Validates, normalizes, and identifies duplicates in raw table rows.
 */
export function processRawRows(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping | null,
  options?: ProcessRowsOptions
): ParseResult {
  if (!mapping) {
    return {
      headers,
      recipients: [],
      totalRows: rows.length,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      detectedMapping: null,
      exceedsLimit: false,
      fileError: 'Could not automatically identify Name and Phone columns. Please map them manually.',
    };
  }

  const nameIdx = headers.indexOf(mapping.nameColumn);
  const phoneIdx = headers.indexOf(mapping.phoneColumn);

  if (nameIdx === -1 || phoneIdx === -1) {
    return {
      headers,
      recipients: [],
      totalRows: rows.length,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      detectedMapping: mapping,
      exceedsLimit: false,
      fileError: 'Selected columns not found in file headers.',
    };
  }

  const recipients: RecipientRecord[] = [];
  const seenPhones = new Set<string>();
  const existingSet = new Set<string>();

  if (options?.existingPhones) {
    for (const p of options.existingPhones) {
      existingSet.add(p);
    }
  }

  const maxLimit = options?.maxLimit ?? MAX_RECIPIENTS_PER_CAMPAIGN;

  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // Row 1 is header
    const rawName = (row[nameIdx] ?? '').trim();
    const rawPhone = (row[phoneIdx] ?? '').trim();

    // Check if row is completely empty
    const isEntireRowEmpty = row.every((c) => !c || c.trim().length === 0);
    if (isEntireRowEmpty) {
      continue;
    }

    const id = `rec_${rowNumber}_${Math.random().toString(36).slice(2, 8)}`;

    // Validate Name
    if (!rawName) {
      invalidCount++;
      recipients.push({
        id,
        rawName: '',
        rawPhone,
        normalizedPhone: '',
        maskedPhone: maskPhoneNumber(rawPhone),
        status: 'invalid',
        validationError: 'Customer name is missing',
        selected: false,
        rowNumber,
      });
      continue;
    }

    // Validate and Normalize Phone
    const phoneValidation = normalizePhoneNumber(rawPhone);
    if (!phoneValidation.isValid) {
      invalidCount++;
      recipients.push({
        id,
        rawName,
        rawPhone,
        normalizedPhone: phoneValidation.normalized,
        maskedPhone: maskPhoneNumber(rawPhone),
        status: 'invalid',
        validationError: phoneValidation.error || 'Invalid phone number format',
        selected: false,
        rowNumber,
      });
      continue;
    }

    const normalizedPhone = phoneValidation.normalized;

    // Check duplicate against existing campaign recipients first
    if (existingSet.has(normalizedPhone)) {
      duplicateCount++;
      recipients.push({
        id,
        rawName,
        rawPhone,
        normalizedPhone,
        maskedPhone: maskPhoneNumber(normalizedPhone),
        status: 'duplicate',
        validationError: `Already registered in this campaign (${maskPhoneNumber(normalizedPhone)})`,
        selected: false,
        rowNumber,
      });
      continue;
    }

    // Check intra-file duplicate
    if (seenPhones.has(normalizedPhone)) {
      duplicateCount++;
      recipients.push({
        id,
        rawName,
        rawPhone,
        normalizedPhone,
        maskedPhone: maskPhoneNumber(normalizedPhone),
        status: 'duplicate',
        validationError: `Duplicate phone number in uploaded file (${maskPhoneNumber(normalizedPhone)})`,
        selected: false,
        rowNumber,
      });
      continue;
    }

    // Check Campaign/Batch Limit (500 recipients)
    if (validCount >= maxLimit) {
      invalidCount++;
      recipients.push({
        id,
        rawName,
        rawPhone,
        normalizedPhone,
        maskedPhone: maskPhoneNumber(normalizedPhone),
        status: 'invalid',
        validationError: `Campaign limit of ${maxLimit} unique recipients exceeded`,
        selected: false,
        rowNumber,
      });
      continue;
    }

    // Valid recipient
    seenPhones.add(normalizedPhone);
    validCount++;
    recipients.push({
      id,
      rawName,
      rawPhone,
      normalizedPhone,
      maskedPhone: maskPhoneNumber(normalizedPhone),
      status: 'valid',
      selected: true,
      rowNumber,
    });
  }

  const exceedsLimit = validCount > maxLimit;

  return {
    headers,
    recipients,
    totalRows: recipients.length,
    validCount,
    invalidCount,
    duplicateCount,
    detectedMapping: mapping,
    exceedsLimit,
  };
}

export interface ParseCustomerFileOptions {
  customMapping?: ColumnMapping | null;
  existingPhones?: Set<string> | string[];
  maxLimit?: number;
}

/**
 * Parses an Excel (.xlsx) or CSV file buffer using ExcelJS.
 */
export async function parseCustomerFile(
  buffer: Buffer,
  filename: string,
  mappingOrOptions?: ColumnMapping | ParseCustomerFileOptions | null
): Promise<ParseResult> {
  const customMapping =
    mappingOrOptions && 'nameColumn' in mappingOrOptions
      ? (mappingOrOptions as ColumnMapping)
      : (mappingOrOptions as ParseCustomerFileOptions | undefined)?.customMapping;

  const rowOptions: ProcessRowsOptions | undefined =
    mappingOrOptions && !('nameColumn' in mappingOrOptions)
      ? {
          existingPhones: (mappingOrOptions as ParseCustomerFileOptions).existingPhones,
          maxLimit: (mappingOrOptions as ParseCustomerFileOptions).maxLimit,
        }
      : undefined;

  const isCsv = filename.toLowerCase().endsWith('.csv');
  const isXlsx = filename.toLowerCase().endsWith('.xlsx');

  if (!isCsv && !isXlsx) {
    return {
      headers: [],
      recipients: [],
      totalRows: 0,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      detectedMapping: null,
      exceedsLimit: false,
      fileError: 'Unsupported file format. Please upload an Excel (.xlsx) or CSV (.csv) file.',
    };
  }

  const workbook = new ExcelJS.Workbook();

  try {
    if (isCsv) {
      // In ExcelJS, map: datum => datum ensures values are preserved as strings with leading zeros
      await workbook.csv.read(Readable.from(buffer), {
        map: (datum: string) => datum,
      });
    } else {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown parsing error';
    return {
      headers: [],
      recipients: [],
      totalRows: 0,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      detectedMapping: null,
      exceedsLimit: false,
      fileError: `Unable to read file: ${message}. Please ensure the file is not corrupted or password-protected.`,
    };
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) {
    return {
      headers: [],
      recipients: [],
      totalRows: 0,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      detectedMapping: null,
      exceedsLimit: false,
      fileError: 'The uploaded file contains no sheets or data rows.',
    };
  }

  // Extract header row (Row 1)
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const val = extractCellValue(cell);
    if (val) {
      headers[colNumber - 1] = val;
    }
  });

  // Fill in any gaps in headers
  for (let i = 0; i < headers.length; i++) {
    if (!headers[i]) {
      headers[i] = `Column ${i + 1}`;
    }
  }

  if (headers.length === 0) {
    return {
      headers: [],
      recipients: [],
      totalRows: 0,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      detectedMapping: null,
      exceedsLimit: false,
      fileError: 'Could not detect column headers in the first row.',
    };
  }

  // Extract data rows (Row 2 onwards)
  const rawRows: string[][] = [];
  const rowCount = worksheet.rowCount;

  for (let r = 2; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    const rowValues: string[] = [];
    let hasAnyValue = false;

    for (let c = 1; c <= headers.length; c++) {
      const cell = row.getCell(c);
      const val = extractCellValue(cell);
      rowValues.push(val);
      if (val.length > 0) {
        hasAnyValue = true;
      }
    }

    if (hasAnyValue) {
      rawRows.push(rowValues);
    }
  }

  const detectedMapping = customMapping || detectColumnMapping(headers);

  return processRawRows(headers, rawRows, detectedMapping, rowOptions);
}

