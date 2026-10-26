import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  parseCustomerFile,
  detectColumnMapping,
  MAX_RECIPIENTS_PER_CAMPAIGN,
} from '@/lib/parser';

describe('Excel and CSV Customer File Parser', () => {
  it('detects various column headings correctly', () => {
    expect(detectColumnMapping(['Name', 'Phone'])).toEqual({
      nameColumn: 'Name',
      phoneColumn: 'Phone',
    });

    expect(detectColumnMapping(['Customer Name', 'Phone Number', 'Email'])).toEqual({
      nameColumn: 'Customer Name',
      phoneColumn: 'Phone Number',
    });

    expect(detectColumnMapping(['Full Name', 'Mobile Number', 'City'])).toEqual({
      nameColumn: 'Full Name',
      phoneColumn: 'Mobile Number',
    });

    expect(detectColumnMapping(['Client', 'Tel'])).toEqual({
      nameColumn: 'Client',
      phoneColumn: 'Tel',
    });
  });

  it('parses CSV files preserving phone numbers with leading zeros', async () => {
    const csvContent = `Customer Name,Phone Number\nAbebe Kebede,0911223344\nSara Tadesse,0712345678\n`;
    const buffer = Buffer.from(csvContent, 'utf-8');

    const result = await parseCustomerFile(buffer, 'customers.csv');

    expect(result.fileError).toBeUndefined();
    expect(result.totalRows).toBe(2);
    expect(result.validCount).toBe(2);
    expect(result.recipients[0].rawPhone).toBe('0911223344');
    expect(result.recipients[0].normalizedPhone).toBe('+251911223344');
    expect(result.recipients[1].rawPhone).toBe('0712345678');
    expect(result.recipients[1].normalizedPhone).toBe('+251712345678');
  });

  it('parses Excel (.xlsx) files preserving leading zeros and ignoring blank rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Customers');

    ws.addRow(['Full Name', 'Mobile']);
    ws.addRow(['Chala Bekele', '0912000000']);
    ws.addRow(['', '']); // Blank row
    ws.addRow(['Tigist Haile', '+251922000000']);
    ws.addRow(['   ', '   ']); // Whitespace row

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    const result = await parseCustomerFile(Buffer.from(buffer), 'customers.xlsx');

    expect(result.fileError).toBeUndefined();
    expect(result.validCount).toBe(2);
    expect(result.recipients[0].rawName).toBe('Chala Bekele');
    expect(result.recipients[0].normalizedPhone).toBe('+251912000000');
    expect(result.recipients[1].rawName).toBe('Tigist Haile');
    expect(result.recipients[1].normalizedPhone).toBe('+251922000000');
  });

  it('identifies invalid rows (missing name, invalid phone)', async () => {
    const csv = `Name,Phone\n,0911223344\nDawit Alemu,\nHelen Tesfaye,invalid_phone\nValid Person,0911000001\n`;
    const buffer = Buffer.from(csv, 'utf-8');

    const result = await parseCustomerFile(buffer, 'test.csv');

    expect(result.validCount).toBe(1);
    expect(result.invalidCount).toBe(3);

    const missingName = result.recipients.find((r) => r.validationError === 'Customer name is missing');
    expect(missingName).toBeDefined();

    const missingPhone = result.recipients.find((r) => r.rawName === 'Dawit Alemu');
    expect(missingPhone?.status).toBe('invalid');

    const invalidFormat = result.recipients.find((r) => r.rawName === 'Helen Tesfaye');
    expect(invalidFormat?.status).toBe('invalid');
  });

  it('detects duplicate phone numbers after normalization', async () => {
    // Both 0911223344 and +251911223344 resolve to the same normalized number
    const csv = `Customer Name,Phone Number\nAbebe Kebede,0911223344\nAbebe Clone,+251911223344\nAnother Person,0911999999\n`;
    const buffer = Buffer.from(csv, 'utf-8');

    const result = await parseCustomerFile(buffer, 'duplicates.csv');

    expect(result.validCount).toBe(2);
    expect(result.duplicateCount).toBe(1);

    const dup = result.recipients.find((r) => r.status === 'duplicate');
    expect(dup).toBeDefined();
    expect(dup?.rawName).toBe('Abebe Clone');
    expect(dup?.selected).toBe(false); // Duplicates unselected by default
  });

  it('enforces the 500-recipient limit per campaign', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Bulk');
    ws.addRow(['Name', 'Phone']);

    // Generate 505 unique recipients
    for (let i = 1; i <= 505; i++) {
      const phoneSuffix = String(i).padStart(7, '0');
      ws.addRow([`Customer ${i}`, `09${phoneSuffix}`]);
    }

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    const result = await parseCustomerFile(Buffer.from(buffer), 'bulk.xlsx');

    expect(result.validCount).toBe(MAX_RECIPIENTS_PER_CAMPAIGN);
    expect(result.invalidCount).toBe(5); // 5 rows flagged as exceeding limit
    expect(result.recipients[500].validationError).toContain('Campaign limit of 500 unique recipients exceeded');
  });

  it('supports manual column mapping override', async () => {
    const csv = `ColA,ColB,ColC\nExtra,Yonas Mobile Customer,0911223344\n`;
    const buffer = Buffer.from(csv, 'utf-8');

    const result = await parseCustomerFile(buffer, 'custom.csv', {
      nameColumn: 'ColB',
      phoneColumn: 'ColC',
    });

    expect(result.validCount).toBe(1);
    expect(result.recipients[0].rawName).toBe('Yonas Mobile Customer');
    expect(result.recipients[0].normalizedPhone).toBe('+251911223344');
  });
});
