'use client';

import React, { useState, useEffect, use, Suspense } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { AccessKeyModal } from '@/components/AccessKeyModal';
import { CampaignRecord } from '@/types';
import {
  ArrowLeft,
  Calendar,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Download,
  AlertCircle,
  Search,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';

function CampaignDetailsContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

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
  const [currency, setCurrency] = useState('ETB');
  const [balance, setBalance] = useState<{ balance: string; estimatedMessages: string } | null>(null);

  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Recipient table filter & search state
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'SUBMITTED' | 'DELIVERED' | 'FAILED' | 'PENDING'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadCampaignDetails() {
      try {
        const configRes = await fetch('/api/config');
        if (configRes.ok && active) {
          const configData = await configRes.json();
          setAuthRequired(Boolean(configData.authRequired));
          setProviderConfigured(Boolean(configData.providerConfigured));
          if (configData.senderName) setSenderName(configData.senderName);
          if (configData.currency) setCurrency(configData.currency);
          if (configData.balance) setBalance(configData.balance);
        }

        const headers: Record<string, string> = {};
        if (accessKey) {
          headers['x-app-access-key'] = accessKey;
        }

        const res = await fetch(`/api/campaigns/${id}`, { headers });
        if (res.ok && active) {
          const campaignData: CampaignRecord = await res.json();
          setCampaign(campaignData);
          setError(null);
        } else if (res.status === 401 && active) {
          setError('Access authorization required to view this campaign.');
          setIsAccessModalOpen(true);
        } else if (active) {
          const errData = await res.json().catch(() => ({}));
          setError(errData.error || 'Failed to load campaign details.');
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

    loadCampaignDetails();

    return () => {
      active = false;
    };
  }, [id, accessKey, refreshTrigger]);

  const handleSaveAccessKey = (key: string) => {
    setAccessKey(key);
    sessionStorage.setItem('yonas_sms_access_key', key);
  };

  // Safe retry of only failed or timed-out recipients
  const handleRetryFailed = async () => {
    if (!campaign) return;
    setIsRetrying(true);
    setRetryMessage(null);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessKey) {
        headers['x-app-access-key'] = accessKey;
      }

      // 1. Reset failed recipients in database
      const resetRes = await fetch(`/api/campaigns/${id}/retry`, {
        method: 'POST',
        headers,
      });

      if (!resetRes.ok) {
        const errData = await resetRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to queue retries');
      }

      setRetryMessage('Failed messages reset. Now sending retries in safe batches...');

      // 2. Dispatch batch sending for the pending retried recipients
      let remaining = 1;
      while (remaining > 0) {
        const sendRes = await fetch(`/api/campaigns/${id}/send-batch`, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });

        if (!sendRes.ok) {
          const sendErr = await sendRes.json().catch(() => ({}));
          throw new Error(sendErr.error || 'Batch retry failed');
        }

        const sendData = await sendRes.json();
        remaining = sendData.remainingPending || 0;
      }

      setRetryMessage('Retry completed successfully.');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error executing retry';
      setError(msg);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDownloadCsv = () => {
    const url = `/api/campaigns/${id}/export`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign_${id}_results.csv`;
    a.click();
  };

  const recipients = campaign?.recipients || [];

  const filteredRecipients = recipients.filter((r) => {
    if (recipientFilter !== 'all') {
      if (recipientFilter === 'PENDING') {
        if (r.status !== 'PENDING' && r.status !== 'TIMEOUT_UNCONFIRMED') return false;
      } else if (r.status !== recipientFilter) {
        return false;
      }
    }

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      return (
        (r.recipientName && r.recipientName.toLowerCase().includes(q)) ||
        r.phone.includes(q) ||
        r.maskedPhone.includes(q) ||
        (r.providerMessageId && r.providerMessageId.toLowerCase().includes(q))
      );
    }

    return true;
  });

  const failedCount = campaign ? campaign.failedCount : 0;

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
        {/* Navigation Breadcrumb & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              title="Back to History"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  {campaign?.name || 'Campaign Details'}
                </h1>
                {campaign && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 font-mono text-slate-600 border border-slate-200">
                    ID: {campaign.id}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500 flex items-center gap-2 font-mono">
                {campaign && (
                  <>
                    <Calendar className="h-3 w-3" />
                    Created: {new Date(campaign.createdAt).toLocaleString()}
                    {campaign.completedAt && (
                      <span>• Completed: {new Date(campaign.completedAt).toLocaleString()}</span>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {failedCount > 0 && (
              <button
                type="button"
                onClick={handleRetryFailed}
                disabled={isRetrying}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors shadow-2xs disabled:opacity-50"
              >
                <RotateCcw className={`h-3.5 w-3.5 text-amber-700 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{isRetrying ? 'Retrying Failed...' : `Retry Failed (${failedCount})`}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setRefreshTrigger((prev) => prev + 1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              title="Refresh details"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Notices */}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-900">Error</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {retryMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900">Retry Progress</p>
              <p className="mt-0.5">{retryMessage}</p>
            </div>
          </div>
        )}

        {/* Campaign Metrics Cards */}
        {campaign && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <span className="text-xs font-medium text-slate-500">Total Recipients</span>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {campaign.totalRecipients}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs">
              <span className="text-xs font-medium text-emerald-800 flex items-center gap-1">
                <Send className="h-3.5 w-3.5 text-emerald-600" />
                Submitted
              </span>
              <p className="mt-1 text-2xl font-bold text-emerald-900">
                {campaign.submittedCount}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-2xs">
              <span className="text-xs font-medium text-blue-800 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                Delivered
              </span>
              <p className="mt-1 text-2xl font-bold text-blue-900">
                {campaign.deliveredCount}
              </p>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-2xs">
              <span className="text-xs font-medium text-rose-800 flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-rose-600" />
                Failed
              </span>
              <p className="mt-1 text-2xl font-bold text-rose-900">
                {campaign.failedCount}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-2xs">
              <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Pending / Timeout
              </span>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {campaign.pendingCount}
              </p>
            </div>
          </section>
        )}

        {/* Message Template Card */}
        {campaign && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                Message Template
              </div>
              {campaign.estimatedCost !== null && campaign.estimatedCost !== undefined && (
                <div className="text-xs text-slate-600">
                  Estimated Cost:{' '}
                  <span className="font-bold text-slate-900">
                    {campaign.estimatedCost.toFixed(2)} {currency}
                  </span>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 font-sans">
              {campaign.messageTemplate}
            </p>
          </section>
        )}

        {/* Recipient Results Table Section */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Recipient Outcomes ({recipients.length})
              </h2>
              <p className="text-xs text-slate-500">
                Detailed delivery reconciliation per customer. Phone numbers are masked for privacy.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100/70 p-1 text-xs">
              <button
                type="button"
                onClick={() => setRecipientFilter('all')}
                className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                  recipientFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({recipients.length})
              </button>
              <button
                type="button"
                onClick={() => setRecipientFilter('SUBMITTED')}
                className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                  recipientFilter === 'SUBMITTED'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Submitted
              </button>
              <button
                type="button"
                onClick={() => setRecipientFilter('DELIVERED')}
                className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                  recipientFilter === 'DELIVERED'
                    ? 'bg-white text-blue-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Delivered
              </button>
              <button
                type="button"
                onClick={() => setRecipientFilter('FAILED')}
                className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                  recipientFilter === 'FAILED'
                    ? 'bg-white text-rose-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Failed
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="mt-4 flex items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search recipient or message ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs shadow-xs focus:border-blue-600 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Recipients Table */}
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5">Recipient</th>
                    <th className="px-3 py-2.5">Masked Phone</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Provider Message ID / Failure Reason</th>
                    <th className="px-3 py-2.5 text-center">Retries</th>
                    <th className="px-3 py-2.5 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        <RefreshCw className="h-4 w-4 animate-spin mx-auto text-blue-600 mb-1" />
                        Loading recipients...
                      </td>
                    </tr>
                  ) : filteredRecipients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No recipient records match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredRecipients.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {r.recipientName || 'Customer'}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-700">
                          {r.maskedPhone}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.status === 'DELIVERED' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800 border border-blue-200">
                              <CheckCircle2 className="h-3 w-3 text-blue-600" />
                              Delivered
                            </span>
                          )}
                          {r.status === 'SUBMITTED' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                              <Send className="h-3 w-3 text-emerald-600" />
                              Submitted
                            </span>
                          )}
                          {r.status === 'FAILED' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 border border-rose-200">
                              <XCircle className="h-3 w-3 text-rose-600" />
                              Failed
                            </span>
                          )}
                          {r.status === 'TIMEOUT_UNCONFIRMED' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                              <Clock className="h-3 w-3 text-amber-600" />
                              Timeout Unconfirmed
                            </span>
                          )}
                          {r.status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {r.status === 'FAILED' || r.status === 'TIMEOUT_UNCONFIRMED' ? (
                            <span className="text-rose-700 font-medium">
                              {r.failureReason || 'Dispatch failed'}
                            </span>
                          ) : (
                            <span className="font-mono text-slate-700 text-[11px]">
                              {r.providerMessageId || '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-500 font-mono">
                          {r.retryCount > 0 ? (
                            <span className="rounded bg-amber-50 text-amber-800 px-1.5 py-0.5 text-[10px] font-bold">
                              {r.retryCount}x
                            </span>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[11px] text-slate-400">
                          {r.deliveredAt
                            ? new Date(r.deliveredAt).toLocaleTimeString()
                            : r.submittedAt
                            ? new Date(r.submittedAt).toLocaleTimeString()
                            : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
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

export default function CampaignDetailsPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-sans text-sm">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Loading campaign details...</span>
          </div>
        </div>
      }
    >
      <CampaignDetailsContent {...props} />
    </Suspense>
  );
}
