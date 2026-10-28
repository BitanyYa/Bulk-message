'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Edit3,
  Sparkles,
  Info,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Calculator,
} from 'lucide-react';
import { analyzeSmsMessage, personalizeMessage, findUnresolvedPlaceholders } from '@/lib/sms';

interface EditCampaignMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  currentMessage: string;
  isArchived: boolean;
  accessKey: string;
  tariffPerSegment?: number | null;
  currency?: string;
  onMessageSaved: (newMessage: string) => void;
}

export function EditCampaignMessageModal({
  isOpen,
  onClose,
  campaignId,
  campaignName,
  currentMessage,
  isArchived,
  accessKey,
  tariffPerSegment = 0.35,
  currency = 'ETB',
  onMessageSaved,
}: EditCampaignMessageModalProps) {
  const [message, setMessage] = useState(currentMessage);
  const [prevCurrentMessage, setPrevCurrentMessage] = useState(currentMessage);
  const [previewCustomerName, setPreviewCustomerName] = useState('Abebe Bikila');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync state if currentMessage prop changes (React recommended pattern)
  if (currentMessage !== prevCurrentMessage) {
    setPrevCurrentMessage(currentMessage);
    setMessage(currentMessage);
    setError(null);
    setSuccess(false);
  }

  if (!isOpen) return null;

  const analysis = analyzeSmsMessage(message);
  const invalidPlaceholders = findUnresolvedPlaceholders(message);
  const hasInvalidPlaceholders = invalidPlaceholders.length > 0;
  const isMessageEmpty = !message.trim();
  const isTooLong = message.length > 1000;
  const isUnchanged = message.trim() === currentMessage.trim();

  const estCostPerMessage =
    tariffPerSegment && tariffPerSegment > 0
      ? (analysis.segmentCount * tariffPerSegment).toFixed(2)
      : null;

  const handleInsertPlaceholder = (placeholder: string) => {
    if (!textareaRef.current) {
      setMessage((prev) => `${prev} ${placeholder} `);
      return;
    }
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextVal = message.substring(0, start) + placeholder + message.substring(end);
    setMessage(nextVal);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isArchived) {
      setError('Cannot edit message for a closed campaign. Please reopen it first.');
      return;
    }

    if (isMessageEmpty) {
      setError('Campaign message cannot be empty.');
      return;
    }

    if (isTooLong) {
      setError('Campaign message exceeds the 1,000 character limit.');
      return;
    }

    if (hasInvalidPlaceholders) {
      setError(
        `Unsupported placeholder(s): ${invalidPlaceholders.join(
          ', '
        )}. Only {{name}} is supported.`
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessKey) {
        headers['x-app-access-key'] = accessKey;
      }

      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ messageTemplate: message.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update campaign message');
      }

      setSuccess(true);
      onMessageSaved(message.trim());
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating campaign message';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Edit3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Edit Campaign Message</h2>
              <p className="text-xs text-slate-500 font-medium">
                {campaignName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Informational Callout */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 flex items-start gap-3 text-xs text-blue-900">
            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-blue-950">
                Default message for new customer batches
              </p>
              <p className="text-blue-800 leading-relaxed">
                Saving this updated message will set the new default for any future batches added to
                this campaign. Existing batches and previously sent SMS history will preserve their
                original message snapshots.
              </p>
            </div>
          </div>

          {/* Archived notice if closed */}
          {isArchived && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-start gap-3 text-xs text-amber-900">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-950">Campaign is currently closed</p>
                <p className="text-amber-800">
                  Please reopen this campaign before editing its message.
                </p>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* Success Banner */}
          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Campaign message updated successfully!</span>
            </div>
          )}

          {/* Composer Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="campaign-edit-msg" className="text-xs font-semibold text-slate-800">
                Campaign Message Template
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500">Insert tag:</span>
                <button
                  type="button"
                  onClick={() => handleInsertPlaceholder('{{name}}')}
                  disabled={isArchived || saving}
                  className="rounded-md border border-blue-200 bg-blue-50/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
                  title="Insert personalized recipient name"
                >
                  + &#123;&#123;name&#125;&#125;
                </button>
              </div>
            </div>

            <textarea
              id="campaign-edit-msg"
              ref={textareaRef}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isArchived || saving}
              placeholder="Write your campaign SMS message here... e.g. Selam {{name}}, thank you for your order at Yonas Mobile!"
              className="w-full rounded-xl border border-slate-300 p-3 font-sans text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-hidden focus:ring-3 focus:ring-blue-100 disabled:bg-slate-100 disabled:cursor-not-allowed"
            />

            {/* Analysis Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 border border-slate-200 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-700">
                  Characters:{' '}
                  <strong className={analysis.charCount > 160 ? 'text-blue-700' : 'text-slate-900'}>
                    {analysis.charCount}
                  </strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-medium text-slate-700">
                  Segments:{' '}
                  <strong className={analysis.segmentCount > 1 ? 'text-amber-700' : 'text-slate-900'}>
                    {analysis.segmentCount} {analysis.segmentCount === 1 ? 'SMS' : 'SMS parts'}
                  </strong>
                </span>
                <span className="text-slate-300">•</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    analysis.encoding === 'GSM-7'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {analysis.encoding}
                </span>
              </div>

              {estCostPerMessage && (
                <div className="flex items-center gap-1 font-semibold text-slate-700">
                  <Calculator className="h-3.5 w-3.5 text-blue-600" />
                  <span>
                    ~{estCostPerMessage} {currency} / recipient
                  </span>
                </div>
              )}
            </div>

            {/* Invalid placeholder warning */}
            {hasInvalidPlaceholders && (
              <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                Unsupported placeholder(s): {invalidPlaceholders.join(', ')}. Only &#123;&#123;name&#125;&#125; is supported.
              </p>
            )}

            {/* Unicode warning */}
            {analysis.hasUnicode && (
              <p className="text-[11px] text-amber-700">
                Note: Non-GSM characters detected (Amharic or special symbols). Concatenated Unicode messages are limited to 67 characters per SMS segment.
              </p>
            )}
          </div>

          {/* Personalized Live Preview */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                <span>Personalized Live Preview</span>
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="preview-name-input"
                  className="text-[11px] text-slate-500 font-medium"
                >
                  Sample customer:
                </label>
                <input
                  id="preview-name-input"
                  type="text"
                  value={previewCustomerName}
                  onChange={(e) => setPreviewCustomerName(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  placeholder="Enter a test name"
                />
              </div>
            </div>

            <div className="rounded-lg bg-white p-3.5 border border-slate-200 shadow-2xs font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
              {personalizeMessage(message || 'Your personalized message will appear here...', previewCustomerName)}
            </div>
            <p className="text-[10px] text-slate-400 italic">
              Recipient name &apos;{previewCustomerName}&apos; replaces &#123;&#123;name&#125;&#125; dynamically for each customer upon sending.
            </p>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                saving ||
                isArchived ||
                isMessageEmpty ||
                hasInvalidPlaceholders ||
                isTooLong ||
                isUnchanged
              }
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
