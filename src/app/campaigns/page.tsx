'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { AccessKeyModal } from '@/components/AccessKeyModal';
import { CampaignRecord, CampaignListResponse } from '@/types';
import {
  History,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  PlusCircle,
  Layers,
  AlertTriangle,
} from 'lucide-react';

export default function CampaignHistoryPage() {
  const [accessKey, setAccessKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('yonas_sms_access_key') || '';
    }
    return '';
  });
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);

  const [authRequired, setAuthRequired] = useState(false);
  const [providerConfigured, setProviderConfigured] = useState(true);
  const [senderName, setSenderName] = useState('YonasMobile');
  const [balance, setBalance] = useState<{ balance: string; estimatedMessages: string } | null>(null);

  // Filters & Pagination State
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [data, setData] = useState<CampaignListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCampaigns() {
      try {
        const configRes = await fetch('/api/config');
        if (configRes.ok && active) {
          const configData = await configRes.json();
          setAuthRequired(Boolean(configData.authRequired));
          setProviderConfigured(Boolean(configData.providerConfigured));
          if (configData.senderName) setSenderName(configData.senderName);
          if (configData.balance) setBalance(configData.balance);
        }

        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (status) params.set('status', status);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        params.set('page', String(page));
        params.set('pageSize', String(pageSize));

        const headers: Record<string, string> = {};
        if (accessKey) {
          headers['x-app-access-key'] = accessKey;
        }

        const res = await fetch(`/api/campaigns?${params.toString()}`, { headers });
        if (res.ok && active) {
          const listData: CampaignListResponse = await res.json();
          setData(listData);
          setError(null);
        } else if (res.status === 401 && active) {
          setError('Access authorization required to view campaign history.');
          setIsAccessModalOpen(true);
        } else if (active) {
          const errData = await res.json().catch(() => ({}));
          setError(errData.error || 'Failed to load campaigns.');
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : 'Network error';
          setError(msg);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadCampaigns();

    return () => {
      active = false;
    };
  }, [search, status, startDate, endDate, page, accessKey]);

  const handleSaveAccessKey = (key: string) => {
    setAccessKey(key);
    sessionStorage.setItem('yonas_sms_access_key', key);
  };

  const getStatusBadge = (s: CampaignRecord['status']) => {
    switch (s) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
            Completed
          </span>
        );
      case 'SENDING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
            Sending
          </span>
        );
      case 'PARTIALLY_FAILED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-600"></span>
            Partially Failed
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800 border border-rose-200">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-600"></span>
            Failed
          </span>
        );
      case 'INTERRUPTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-300">
            Interrupted
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
            Draft
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
      <Header
        accessKey={accessKey}
        onOpenAccessModal={() => setIsAccessModalOpen(true)}
        authRequired={authRequired}
        providerConfigured={providerConfigured}
        senderName={senderName}
        balance={balance}
      />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 space-y-6">
        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl flex items-center gap-2">
              <History className="h-6 w-6 text-blue-700" />
              Campaign History
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Search, filter, and review persistent campaign outcomes and delivery logs.
            </p>
          </div>

          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors self-start sm:self-auto"
          >
            <PlusCircle className="h-4 w-4" />
            <span>New Campaign</span>
          </Link>
        </div>

        {/* Error notification */}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-900">Notice</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Filters Bar */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search campaign name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs shadow-xs focus:border-blue-600 focus:outline-hidden"
              />
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-xs focus:border-blue-600 focus:outline-hidden"
              >
                <option value="">All Statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="SENDING">Sending</option>
                <option value="PARTIALLY_FAILED">Partially Failed</option>
                <option value="FAILED">Failed</option>
                <option value="INTERRUPTED">Interrupted</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>

            {/* Start Date */}
            <div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-xs focus:border-blue-600 focus:outline-hidden"
                title="Start Date"
              />
            </div>

            {/* End Date */}
            <div>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-xs focus:border-blue-600 focus:outline-hidden"
                title="End Date"
              />
            </div>
          </div>
        </section>

        {/* Campaign List Table */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Campaign Name</th>
                  <th className="px-4 py-3">Dispatched Date</th>
                  <th className="px-4 py-3 text-center">Total</th>
                  <th className="px-4 py-3 text-center">Submitted</th>
                  <th className="px-4 py-3 text-center">Delivered</th>
                  <th className="px-4 py-3 text-center">Failed</th>
                  <th className="px-4 py-3 text-center">Pending</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto text-blue-600 mb-2" />
                      Loading campaigns...
                    </td>
                  </tr>
                ) : !data || data.campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-14 text-center text-slate-400">
                      <Layers className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-700">No campaigns found</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {search || status || startDate || endDate
                          ? 'Try adjusting your search criteria or date filters.'
                          : 'No campaigns have been created in the database yet.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  data.campaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3.5 font-semibold text-slate-900">
                        {c.name}
                        {c.originalFilename && (
                          <span className="block text-[11px] font-normal text-slate-400">
                            {c.originalFilename}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-600 text-[11px]">
                        {new Date(c.createdAt).toLocaleDateString()} {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold text-slate-800">
                        {c.totalRecipients}
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold text-emerald-700">
                        {c.submittedCount}
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold text-blue-700">
                        {c.deliveredCount}
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold text-rose-700">
                        {c.failedCount}
                      </td>
                      <td className="px-4 py-3.5 text-center font-medium text-slate-500">
                        {c.pendingCount}
                      </td>
                      <td className="px-4 py-3.5">{getStatusBadge(c.status)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <span>View Details</span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-xs">
              <span className="text-slate-600">
                Showing Page <span className="font-semibold text-slate-900">{data.page}</span> of{' '}
                <span className="font-semibold text-slate-900">{data.totalPages}</span> ({data.total} total campaigns)
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={data.page <= 1 || loading}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={data.page >= data.totalPages || loading}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      <AccessKeyModal
        isOpen={isAccessModalOpen}
        onClose={() => setIsAccessModalOpen(false)}
        currentKey={accessKey}
        onSaveKey={handleSaveAccessKey}
        authRequired={authRequired}
      />
    </div>
  );
}
