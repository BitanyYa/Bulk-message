'use client';

import React from 'react';
import { AlertTriangle, Send, X, ShieldAlert } from 'lucide-react';

interface SendConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSend: () => void;
  recipientCount: number;
  segmentsPerMessage: number;
  totalSegments: number;
  estimatedCost: number | null;
  currency: string;
  senderName: string;
  isSending: boolean;
}

export function SendConfirmationModal({
  isOpen,
  onClose,
  onConfirmSend,
  recipientCount,
  segmentsPerMessage,
  totalSegments,
  estimatedCost,
  currency,
  senderName,
  isSending,
}: SendConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Confirm Real SMS Campaign
              </h2>
              <p className="text-xs text-slate-500">
                Live carrier charges will apply
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900">
                You are about to send real SMS messages via AfroMessage
              </p>
              <p className="mt-1 leading-relaxed text-amber-800">
                This campaign will dispatch live SMS text messages to genuine customer mobile numbers using your AfroMessage sender credentials. This action cannot be undone once submitted.
              </p>
            </div>
          </div>
        </div>

        {/* Campaign Metrics Summary */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs space-y-2.5">
          <div className="flex justify-between items-center text-slate-600">
            <span>Sender Name:</span>
            <span className="font-semibold text-slate-900">{senderName}</span>
          </div>

          <div className="flex justify-between items-center text-slate-600">
            <span>Selected Recipients:</span>
            <span className="font-bold text-slate-900">{recipientCount} recipients</span>
          </div>

          <div className="flex justify-between items-center text-slate-600">
            <span>Segments Per Message:</span>
            <span className="font-semibold text-slate-900">
              {segmentsPerMessage} {segmentsPerMessage === 1 ? 'segment' : 'segments'}
            </span>
          </div>

          <div className="flex justify-between items-center text-slate-600 border-t border-slate-200 pt-2">
            <span>Total Carrier Segments:</span>
            <span className="font-bold text-slate-900">{totalSegments} segments</span>
          </div>

          {estimatedCost !== null && (
            <div className="flex justify-between items-center text-slate-700 bg-blue-50/60 p-2 rounded-md border border-blue-200">
              <span className="font-medium text-blue-900">Estimated Cost:</span>
              <span className="font-bold text-blue-900 text-sm">
                ~ {estimatedCost.toFixed(2)} {currency}
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmSend}
            disabled={isSending}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 disabled:bg-blue-400 transition-colors"
          >
            {isSending ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                <span>Starting Campaign...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span>Confirm & Send Now</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
