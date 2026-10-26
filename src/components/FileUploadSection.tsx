'use client';

import React, { useRef, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { ColumnMapping, ParseResult } from '@/types';
import { MAX_RECIPIENTS_PER_CAMPAIGN } from '@/lib/parser';

interface FileUploadSectionProps {
  onParseComplete: (result: ParseResult, file: File) => void;
  onUpdateMapping: (mapping: ColumnMapping) => void;
  parseResult: ParseResult | null;
  currentMapping: ColumnMapping | null;
  uploadedFileName: string | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export function FileUploadSection({
  onParseComplete,
  onUpdateMapping,
  parseResult,
  currentMapping,
  uploadedFileName,
  isLoading,
  setIsLoading,
}: FileUploadSectionProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [customNameCol, setCustomNameCol] = useState<string | null>(null);
  const [customPhoneCol, setCustomPhoneCol] = useState<string | null>(null);

  const selectedNameCol = customNameCol ?? currentMapping?.nameColumn ?? '';
  const selectedPhoneCol = customPhoneCol ?? currentMapping?.phoneColumn ?? '';

  const handleFileUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'csv') {
      setUploadError('Invalid file type. Please upload an Excel (.xlsx) or CSV (.csv) file.');
      return;
    }

    setUploadError(null);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/parse-file', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${res.status}`);
      }

      const data: ParseResult = await res.json();
      onParseComplete(data, file);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error uploading file';
      setUploadError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleApplyMapping = () => {
    if (selectedNameCol && selectedPhoneCol) {
      onUpdateMapping({
        nameColumn: selectedNameCol,
        phoneColumn: selectedPhoneCol,
      });
    }
  };

  const downloadSampleCsv = () => {
    const sample = `Customer Name,Phone Number
Abebe Kebede,0911223344
Sara Tadesse,0712345678
Dawit Alemu,251911998877
Helen Tesfaye,+251922334455
`;
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yonas_mobile_sample_recipients.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">
              1
            </span>
            Upload Customer File
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Upload an Excel (.xlsx) or CSV (.csv) containing recipient names and phone numbers.
          </p>
        </div>

        <button
          type="button"
          onClick={downloadSampleCsv}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <Download className="h-3.5 w-3.5 text-slate-500" />
          Download Sample Template
        </button>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mt-5 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all ${
          dragOver
            ? 'border-blue-600 bg-blue-50/60'
            : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50/50'
        } ${isLoading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileUpload(e.target.files[0]);
            }
          }}
        />

        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <Upload className="h-6 w-6" />
        </div>

        <div className="mt-3">
          <span className="font-semibold text-blue-700 hover:text-blue-800 text-sm">
            Click to upload
          </span>
          <span className="text-sm text-slate-600"> or drag and drop</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Excel (.xlsx) or CSV (.csv) with customer names and mobile numbers.
        </p>

        {uploadedFileName && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 border border-blue-200">
            <FileSpreadsheet className="h-4 w-4 text-blue-600" />
            <span>Active File: {uploadedFileName}</span>
          </div>
        )}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
          <span>Processing and validating customer spreadsheet...</span>
        </div>
      )}

      {/* Upload or parse error */}
      {(uploadError || parseResult?.fileError) && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <div>
            <p className="font-semibold">File Upload Error</p>
            <p className="mt-0.5">{uploadError || parseResult?.fileError}</p>
          </div>
        </div>
      )}

      {/* 500 recipient limit warning */}
      {parseResult?.exceedsLimit && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="font-semibold">Campaign Limit Notice</p>
            <p className="mt-0.5">
              The uploaded file contains more than {MAX_RECIPIENTS_PER_CAMPAIGN} recipients. For delivery reliability, campaigns are capped at {MAX_RECIPIENTS_PER_CAMPAIGN} unique recipients. Excess rows have been excluded.
            </p>
          </div>
        </div>
      )}

      {/* Statistics and Column Mapping after parsing */}
      {parseResult && !parseResult.fileError && (
        <div className="mt-5 space-y-4">
          {/* Summary Pills */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-medium text-slate-500">Total Rows</span>
              <p className="mt-1 text-lg font-bold text-slate-900">{parseResult.totalRows}</p>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <span className="text-xs font-medium text-emerald-700">Valid Recipients</span>
              <p className="mt-1 text-lg font-bold text-emerald-800">{parseResult.validCount}</p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <span className="text-xs font-medium text-amber-700">Duplicates Detected</span>
              <p className="mt-1 text-lg font-bold text-amber-800">{parseResult.duplicateCount}</p>
            </div>

            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
              <span className="text-xs font-medium text-rose-700">Invalid Rows</span>
              <p className="mt-1 text-lg font-bold text-rose-800">{parseResult.invalidCount}</p>
            </div>
          </div>

          {/* Column Mapping Selector */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Column Mapping
                </h3>
                <p className="text-xs text-slate-500">
                  Verify or manually select which columns contain Customer Name and Phone Number.
                </p>
              </div>

              <button
                type="button"
                onClick={handleApplyMapping}
                disabled={
                  !selectedNameCol ||
                  !selectedPhoneCol ||
                  (selectedNameCol === currentMapping?.nameColumn &&
                    selectedPhoneCol === currentMapping?.phoneColumn)
                }
                className="self-start sm:self-auto rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                Apply Mapping
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Customer Name Column
                </label>
                <select
                  value={selectedNameCol}
                  onChange={(e) => setCustomNameCol(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs shadow-xs focus:border-blue-600 focus:outline-hidden"
                >
                  <option value="">-- Select Column --</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Phone Number Column
                </label>
                <select
                  value={selectedPhoneCol}
                  onChange={(e) => setCustomPhoneCol(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs shadow-xs focus:border-blue-600 focus:outline-hidden"
                >
                  <option value="">-- Select Column --</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
