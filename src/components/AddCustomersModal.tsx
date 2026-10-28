'use client';

import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Send,
  Users,
  RefreshCw,
  Info,
} from 'lucide-react';
import { ColumnMapping, ParseResult, RecipientRecord, CampaignRecipientRecord } from '@/types';
import { analyzeSmsMessage, personalizeMessage, findUnresolvedPlaceholders } from '@/lib/sms';

interface AddCustomersModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  defaultMessageTemplate: string;
  existingRecipients: CampaignRecipientRecord[];
  accessKey: string;
  tariffPerSegment: number | null;
  currency: string;
  onBatchCreated: () => void;
}

export function AddCustomersModal({
  isOpen,
  onClose,
  campaignId,
  campaignName,
  defaultMessageTemplate,
  existingRecipients,
  accessKey,
  tariffPerSegment,
  currency,
  onBatchCreated,
}: AddCustomersModalProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'sending'>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [recipients, setRecipients] = useState<RecipientRecord[]>([]);
  const [currentMapping, setCurrentMapping] = useState<ColumnMapping | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch details state
  const [batchName, setBatchName] = useState('');
  const [batchMessage, setBatchMessage] = useState(defaultMessageTemplate);
  const [prevDefaultMessage, setPrevDefaultMessage] = useState(defaultMessageTemplate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync batchMessage with updated campaign default message template
  if (defaultMessageTemplate !== prevDefaultMessage) {
    setPrevDefaultMessage(defaultMessageTemplate);
    setBatchMessage(defaultMessageTemplate);
  }

  // Live sending progress state if user chooses to send immediately
  const [sendingProgress, setSendingProgress] = useState<{
    sent: number;
    total: number;
    remaining: number;
  } | null>(null);

  const existingPhoneList = useMemo(() => {
    return existingRecipients.map((r) => r.phone);
  }, [existingRecipients]);

  const handleFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'csv') {
      setUploadError('Invalid file type. Please upload an Excel (.xlsx) or CSV (.csv) file.');
      return;
    }

    setUploadError(null);
    setIsLoading(true);
    setUploadedFile(file);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('existingPhones', JSON.stringify(existingPhoneList));

      const res = await fetch('/api/parse-file', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to parse file');
      }

      const result: ParseResult = await res.json();
      setParseResult(result);
      setRecipients(result.recipients || []);
      setCurrentMapping(result.detectedMapping);
      setStep('preview');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reading file';
      setUploadError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateMapping = async (newMapping: ColumnMapping) => {
    if (!uploadedFile) return;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);
      formData.append('mapping', JSON.stringify(newMapping));
      formData.append('existingPhones', JSON.stringify(existingPhoneList));

      const res = await fetch('/api/parse-file', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const result: ParseResult = await res.json();
        setParseResult(result);
        setRecipients(result.recipients || []);
        setCurrentMapping(result.detectedMapping);
      }
    } catch {
      // quiet fallback
    } finally {
      setIsLoading(false);
    }
  };

  const validRecipients = useMemo(() => {
    return recipients.filter((r) => r.status === 'valid' && r.selected);
  }, [recipients]);

  const skippedExisting = useMemo(() => {
    return recipients.filter(
      (r) => r.status === 'duplicate' && r.validationError?.includes('Already registered')
    );
  }, [recipients]);

  const intraFileDuplicates = useMemo(() => {
    return recipients.filter(
      (r) => r.status === 'duplicate' && !r.validationError?.includes('Already registered')
    );
  }, [recipients]);

  const invalidRecipients = useMemo(() => {
    return recipients.filter((r) => r.status === 'invalid');
  }, [recipients]);

  const smsAnalysis = useMemo(() => {
    return analyzeSmsMessage(batchMessage);
  }, [batchMessage]);

  const estimatedCost = useMemo(() => {
    if (!tariffPerSegment) return null;
    return validRecipients.length * smsAnalysis.segmentCount * tariffPerSegment;
  }, [validRecipients.length, smsAnalysis.segmentCount, tariffPerSegment]);

  const unresolvedTags = useMemo(() => {
    return findUnresolvedPlaceholders(batchMessage);
  }, [batchMessage]);

  const handleCreateBatch = async (sendImmediately: boolean) => {
    if (validRecipients.length === 0) {
      setErrorMessage('No valid new customers to add. Please check the uploaded file.');
      return;
    }

    if (unresolvedTags.length > 0) {
      setErrorMessage(
        `Unsupported placeholder(s): ${unresolvedTags.join(', ')}. Only {{name}} is supported.`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessKey) {
        headers['x-app-access-key'] = accessKey;
      }

      // 1. Create the new batch and insert recipients
      const res = await fetch(`/api/campaigns/${campaignId}/add-batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: batchName.trim() || undefined,
          messageText: batchMessage.trim(),
          estimatedCost,
          recipients: validRecipients.map((r) => ({
            name: r.rawName,
            phone: r.normalizedPhone,
            maskedPhone: r.maskedPhone,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add customer batch');
      }

      const data = await res.json();
      const newBatch = data.batch;

      // 2. If user requested immediate sending
      if (sendImmediately && newBatch?.id) {
        setStep('sending');
        setSendingProgress({
          sent: 0,
          total: validRecipients.length,
          remaining: validRecipients.length,
        });

        let remaining = validRecipients.length;
        while (remaining > 0) {
          const sendRes = await fetch(`/api/campaigns/${campaignId}/send-batch`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ batchId: newBatch.id }),
          });

          if (!sendRes.ok) {
            const errData = await sendRes.json().catch(() => ({}));
            throw new Error(errData.error || 'Batch dispatch encountered an error');
          }

          const sendData = await sendRes.json();
          remaining = sendData.remainingPending ?? 0;
          setSendingProgress({
            sent: validRecipients.length - remaining,
            total: validRecipients.length,
            remaining,
          });

          if (sendData.batchProcessed === 0) {
            break;
          }
        }
      }

      // Finished successfully
      onBatchCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl my-8 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-700" />
              <span>Add Customers to Campaign</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Target Campaign: <span className="font-semibold text-slate-800">{campaignName}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {errorMessage && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div>{errorMessage}</div>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFile(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-300 bg-slate-50/60 hover:border-blue-400 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFile(e.target.files[0]);
                    }
                  }}
                />

                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 mb-3 shadow-xs">
                  <Upload className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {isLoading ? 'Processing customer file...' : 'Upload Excel or CSV Customer File'}
                </h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm">
                  Drag and drop your spreadsheet here or click to browse. Existing customers in this campaign will be automatically skipped to prevent duplicate SMS charges.
                </p>

                {isLoading && (
                  <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-blue-700">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Parsing customer rows and checking duplicate numbers...</span>
                  </div>
                )}
              </div>

              {uploadError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  {uploadError}
                </div>
              )}

              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-blue-900">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-blue-950">Safe Multi-Batch Sending Protection</p>
                    <p className="text-[11px] text-blue-800">
                      • Uploading another file does <strong>NOT</strong> immediately send messages without your confirmation.
                    </p>
                    <p className="text-[11px] text-blue-800">
                      • Normalized phone numbers prevent sending twice to any customer who was already included in prior batches.
                    </p>
                    <p className="text-[11px] text-blue-800">
                      • Up to 500 new unique recipients can be safely added per sending batch.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-5">
              {/* Batch Breakdown Metrics */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-2xs">
                  <span className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    New Customers
                  </span>
                  <div className="mt-1 text-xl font-bold text-emerald-900">
                    {validRecipients.length}
                  </div>
                  <span className="text-[10px] text-emerald-700">Ready to add</span>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-2xs">
                  <span className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    Already In Campaign
                  </span>
                  <div className="mt-1 text-xl font-bold text-amber-900">
                    {skippedExisting.length}
                  </div>
                  <span className="text-[10px] text-amber-700">Skipped (protected)</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-700">
                    File Duplicates
                  </span>
                  <div className="mt-1 text-xl font-bold text-slate-800">
                    {intraFileDuplicates.length}
                  </div>
                  <span className="text-[10px] text-slate-500">Intra-file duplicate</span>
                </div>

                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 shadow-2xs">
                  <span className="text-[11px] font-semibold text-rose-800">
                    Invalid Numbers
                  </span>
                  <div className="mt-1 text-xl font-bold text-rose-900">
                    {invalidRecipients.length}
                  </div>
                  <span className="text-[10px] text-rose-700">Excluded</span>
                </div>
              </div>

              {/* Column Mapping Review if needed */}
              {parseResult && parseResult.headers.length > 0 && currentMapping && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                      <FileSpreadsheet className="h-4 w-4 text-blue-700" />
                      <span>Columns:</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 text-[11px]">Name:</span>
                      <select
                        value={currentMapping.nameColumn}
                        onChange={(e) =>
                          handleUpdateMapping({ ...currentMapping, nameColumn: e.target.value })
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-800 focus:outline-hidden"
                      >
                        {parseResult.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 text-[11px]">Phone:</span>
                      <select
                        value={currentMapping.phoneColumn}
                        onChange={(e) =>
                          handleUpdateMapping({ ...currentMapping, phoneColumn: e.target.value })
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-800 focus:outline-hidden"
                      >
                        {parseResult.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setStep('upload')}
                    className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 underline"
                  >
                    Change File
                  </button>
                </div>
              )}

              {/* Batch Configuration & Message Review */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Batch Settings & Message Snapshot
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Batch Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder="e.g. Batch 2 - Additional Contacts"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Message for this Batch *
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Snapshotted from campaign template
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={batchMessage}
                    onChange={(e) => setBatchMessage(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 font-mono focus:border-blue-600 focus:outline-hidden"
                  />

                  {/* Character stats bar */}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">
                        {smsAnalysis.charCount} chars
                      </span>
                      <span>•</span>
                      <span className="font-semibold text-blue-700">
                        {smsAnalysis.segmentCount} {smsAnalysis.segmentCount === 1 ? 'Segment' : 'Segments'}
                      </span>
                      <span>•</span>
                      <span className="font-mono">{smsAnalysis.encoding}</span>
                    </div>

                    {estimatedCost !== null && (
                      <span className="font-semibold text-emerald-800">
                        Batch Est. Cost: ~{estimatedCost.toFixed(2)} {currency}
                      </span>
                    )}
                  </div>

                  {unresolvedTags.length > 0 && (
                    <div className="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-800 border border-rose-200">
                      Unsupported placeholder(s): {unresolvedTags.join(', ')}. Only <code className="font-mono">{'{{name}}'}</code> is supported.
                    </div>
                  )}
                </div>
              </div>

              {/* Sample Customer Preview Table */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>New Customer Recipients Preview ({validRecipients.length} accepted)</span>
                  <span className="text-[11px] text-slate-500">
                    Showing first 5 rows
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/50 text-slate-500 text-[11px]">
                      <tr>
                        <th className="px-3 py-2">Customer Name</th>
                        <th className="px-3 py-2">Masked Phone</th>
                        <th className="px-3 py-2">Personalized Sample</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {validRecipients.slice(0, 5).map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-900">{r.rawName}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{r.maskedPhone}</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-600 line-clamp-1 max-w-xs">
                            {personalizeMessage(batchMessage, r.rawName)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                              Ready
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 'sending' && sendingProgress && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                <RefreshCw className="h-7 w-7 animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Dispatching New Customer Batch...
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Sent {sendingProgress.sent} of {sendingProgress.total} messages.
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full max-w-md bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.round((sendingProgress.sent / sendingProgress.total) * 100)}%`,
                  }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {step === 'preview' && (
          <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep('upload')}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Back
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCreateBatch(false)}
                disabled={isSubmitting || validRecipients.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-50 disabled:opacity-50"
              >
                <span>Save Batch as Draft</span>
              </button>

              <button
                type="button"
                onClick={() => handleCreateBatch(true)}
                disabled={isSubmitting || validRecipients.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Confirm & Send to {validRecipients.length} Recipients</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
