'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  Download,
  PlusCircle,
  Check,
  Search,
} from 'lucide-react';
import { RecipientSendResult } from '@/types';

interface SendingProgressSectionProps {
  results: RecipientSendResult[];
  totalExpected: number;
  isSending: boolean;
  onRetryFailed: () => void;
  onStartNewCampaign: () => void;
}

export function SendingProgressSection({
  results,
  totalExpected,
  isSending,
  onRetryFailed,
  onStartNewCampaign,
}: SendingProgressSectionProps) {
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'failed' | 'timeout_unconfirmed'>('all');

  const submittedCount = results.filter((r) => r.status === 'submitted').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const timeoutCount = results.filter((r) => r.status === 'timeout_unconfirmed').length;
  const processedCount = results.length;
  const pendingCount = Math.max(0, totalExpected - processedCount);

  const progressPercent = totalExpected > 0 ? Math.round((processedCount / totalExpected) * 100) : 0;

  const retryableCount = failedCount + timeoutCount;

  const filteredResults = results.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) {
      return false;
    }
    if (searchFilter.trim().length > 0) {
      const q = searchFilter.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        r.maskedPhone.includes(q) ||
        (r.messageId && r.messageId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const exportResultsToCsv = () => {
    const headers = ['Recipient Name', 'Masked Phone', 'Status', 'Message ID', 'Error Reason', 'Timestamp'];
    const rows = results.map((r) => [
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.maskedPhone}"`,
      `"${r.status}"`,
      `"${r.messageId || ''}"`,
      `"${(r.error || '').replace(/"/g, '""')}"`,
      `"${r.timestamp}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yonas_mobile_campaign_results_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">
              4
            </span>
            <h2 className="text-base font-semibold text-slate-900">
              Sending Results & Campaign Progress
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Real-time delivery progress report. Messages are queued with AfroMessage.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {retryableCount > 0 && !isSending && (
            <button
              type="button"
              onClick={onRetryFailed}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors shadow-2xs"
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-700" />
              Retry Failed Messages ({retryableCount})
            </button>
          )}

          {results.length > 0 && (
            <button
              type="button"
              onClick={exportResultsToCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              Export Results CSV
            </button>
          )}

          {!isSending && (
            <button
              type="button"
              onClick={onStartNewCampaign}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 transition-colors"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              New Campaign
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-5 space-y-2">
        <div className="flex justify-between text-xs font-medium text-slate-700">
          <span>
            {isSending ? 'Sending in progress...' : progressPercent === 100 ? 'Campaign Completed' : 'Campaign Paused'}
          </span>
          <span className="font-bold text-slate-900">
            {processedCount} / {totalExpected} ({progressPercent}%)
          </span>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full transition-all duration-300 ${
              isSending ? 'bg-blue-600' : progressPercent === 100 ? 'bg-emerald-600' : 'bg-slate-600'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <span className="text-xs font-medium text-slate-500">Total Campaign</span>
          <p className="mt-1 text-lg font-bold text-slate-900">{totalExpected}</p>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
          <span className="text-xs font-medium text-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Submitted to Provider
          </span>
          <p className="mt-1 text-lg font-bold text-emerald-900">{submittedCount}</p>
        </div>

        <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3">
          <span className="text-xs font-medium text-rose-800 flex items-center gap-1">
            <XCircle className="h-3 w-3 text-rose-600" />
            Failed Messages
          </span>
          <p className="mt-1 text-lg font-bold text-rose-900">{failedCount}</p>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3">
          <span className="text-xs font-medium text-blue-800 flex items-center gap-1">
            <Clock className="h-3 w-3 text-blue-600" />
            Pending / Remaining
          </span>
          <p className="mt-1 text-lg font-bold text-blue-900">{pendingCount}</p>
        </div>
      </div>

      {/* Notice about Submission vs Delivery */}
      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600 leading-relaxed">
        <span className="font-semibold text-slate-800">Notice on Delivery Status:</span> Messages marked as &quot;Submitted&quot; have been validated and accepted by AfroMessage for carrier dispatch. Telecommunication delivery status is updated if webhooks are configured with the carrier.
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100/70 p-1 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`rounded-md px-2.5 py-1 font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Results ({results.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('submitted')}
            className={`rounded-md px-2.5 py-1 font-medium transition-all ${
              statusFilter === 'submitted'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Submitted ({submittedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('failed')}
            className={`rounded-md px-2.5 py-1 font-medium transition-all ${
              statusFilter === 'failed'
                ? 'bg-white text-rose-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Failed ({failedCount})
          </button>
          {timeoutCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter('timeout_unconfirmed')}
              className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                statusFilter === 'timeout_unconfirmed'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Timeouts ({timeoutCount})
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search result or message ID..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs shadow-xs focus:border-blue-600 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Results Log Table */}
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Masked Phone</th>
                <th className="px-3 py-2.5">Submission Status</th>
                <th className="px-3 py-2.5">Provider Message ID / Error</th>
                <th className="px-3 py-2.5 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No results found for current filter.
                  </td>
                </tr>
              ) : (
                filteredResults.map((r) => (
                  <tr key={r.recipientId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">{r.maskedPhone}</td>
                    <td className="px-3 py-2">
                      {r.status === 'submitted' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 border border-emerald-200">
                          <Check className="h-3 w-3" />
                          Submitted
                        </span>
                      )}
                      {r.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800 border border-rose-200">
                          <XCircle className="h-3 w-3" />
                          Failed
                        </span>
                      )}
                      {r.status === 'timeout_unconfirmed' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200">
                          <AlertTriangle className="h-3 w-3" />
                          Timeout Unconfirmed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.status === 'submitted' ? (
                        <span className="font-mono text-[11px] text-slate-700">
                          {r.messageId || 'Queued'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-rose-700">
                          {r.error || 'Submission rejected'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-slate-400">
                      {new Date(r.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
