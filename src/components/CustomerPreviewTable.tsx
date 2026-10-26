'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle,
  AlertCircle,
  Copy,
  Search,
} from 'lucide-react';
import { RecipientRecord } from '@/types';

interface CustomerPreviewTableProps {
  recipients: RecipientRecord[];
  onToggleRecipient: (id: string) => void;
  onSelectAllValid: () => void;
  onDeselectAll: () => void;
  selectedCount: number;
}

export function CustomerPreviewTable({
  recipients,
  onToggleRecipient,
  onSelectAllValid,
  onDeselectAll,
  selectedCount,
}: CustomerPreviewTableProps) {
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'duplicate' | 'invalid'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRecipients = useMemo(() => {
    return recipients.filter((r) => {
      // Tab filter
      if (filterTab !== 'all' && r.status !== filterTab) {
        return false;
      }
      // Search filter
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        return (
          r.rawName.toLowerCase().includes(q) ||
          r.rawPhone.includes(q) ||
          r.normalizedPhone.includes(q)
        );
      }
      return true;
    });
  }, [recipients, filterTab, searchQuery]);

  const validCount = recipients.filter((r) => r.status === 'valid').length;
  const duplicateCount = recipients.filter((r) => r.status === 'duplicate').length;
  const invalidCount = recipients.filter((r) => r.status === 'invalid').length;

  if (recipients.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">
              2
            </span>
            <h2 className="text-base font-semibold text-slate-900">
              Customer Preview & Selection
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Review parsed recipients and select whom to include in this campaign.
          </p>
        </div>

        {/* Selected count pill */}
        <div className="flex items-center gap-2">
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-900">
            Recipients to Send:{' '}
            <span className="font-bold text-blue-700">{selectedCount}</span> / 500
          </div>
        </div>
      </div>

      {/* Action bar: Tabs, Search, and Bulk Selection */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100/70 p-1 text-xs">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`rounded-md px-2.5 py-1 font-medium transition-all ${
              filterTab === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({recipients.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('valid')}
            className={`rounded-md px-2.5 py-1 font-medium transition-all ${
              filterTab === 'valid'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Valid ({validCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('duplicate')}
            className={`rounded-md px-2.5 py-1 font-medium transition-all ${
              filterTab === 'duplicate'
                ? 'bg-white text-amber-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Duplicates ({duplicateCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('invalid')}
            className={`rounded-md px-2.5 py-1 font-medium transition-all ${
              filterTab === 'invalid'
                ? 'bg-white text-rose-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Invalid ({invalidCount})
          </button>
        </div>

        {/* Search & Bulk Select Controls */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search customer or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs shadow-xs focus:border-blue-600 focus:outline-hidden"
            />
          </div>

          <button
            type="button"
            onClick={onSelectAllValid}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            title="Select all valid recipients"
          >
            Select All Valid
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            title="Deselect all recipients"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Recipient Table */}
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="w-10 px-3 py-2.5 text-center">Send</th>
                <th className="w-12 px-3 py-2.5 text-slate-400">#</th>
                <th className="px-3 py-2.5">Customer Name</th>
                <th className="px-3 py-2.5">Phone Number (Masked)</th>
                <th className="px-3 py-2.5">Original File Value</th>
                <th className="px-3 py-2.5">Status & Validation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredRecipients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No recipients found matching current filter.
                  </td>
                </tr>
              ) : (
                filteredRecipients.map((r) => {
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        r.selected ? 'bg-blue-50/30' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={r.selected}
                          onChange={() => onToggleRecipient(r.id)}
                          disabled={r.status === 'invalid'}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                      </td>

                      {/* Row number */}
                      <td className="px-3 py-2 text-slate-400 font-mono">{r.rowNumber}</td>

                      {/* Name */}
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {r.rawName || (
                          <span className="italic text-slate-400 font-normal">Missing Name</span>
                        )}
                      </td>

                      {/* Masked Phone */}
                      <td className="px-3 py-2 font-mono text-slate-700">
                        {r.maskedPhone}
                      </td>

                      {/* Raw Phone */}
                      <td className="px-3 py-2 font-mono text-slate-500 text-[11px]">
                        {r.rawPhone || '—'}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2">
                        {r.status === 'valid' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                            <CheckCircle className="h-3 w-3" />
                            Valid
                          </span>
                        )}

                        {r.status === 'duplicate' && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200"
                            title={r.validationError}
                          >
                            <Copy className="h-3 w-3" />
                            Duplicate (Excluded)
                          </span>
                        )}

                        {r.status === 'invalid' && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800 border border-rose-200"
                            title={r.validationError}
                          >
                            <AlertCircle className="h-3 w-3" />
                            {r.validationError || 'Invalid'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
