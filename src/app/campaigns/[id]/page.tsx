'use client';

import React, { useState, useEffect, use, Suspense } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { AccessKeyModal } from '@/components/AccessKeyModal';
import { AddCustomersModal } from '@/components/AddCustomersModal';
import { EditCampaignMessageModal } from '@/components/EditCampaignMessageModal';
import { CampaignRecord, CampaignBatchRecord } from '@/types';
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
  UserPlus,
  Lock,
  Unlock,
  Layers,
  FileText,
  Edit3,
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
  const [tariffPerSegment, setTariffPerSegment] = useState<number | null>(0.35);
  const [currency, setCurrency] = useState('ETB');
  const [balance, setBalance] = useState<{ balance: string; estimatedMessages: string } | null>(null);

  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Batches and Filter state
  const [selectedBatchId, setSelectedBatchId] = useState<string | 'all'>('all');
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'SUBMITTED' | 'DELIVERED' | 'FAILED' | 'PENDING'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Add Customers & Edit Message Modal state
  const [isAddCustomersOpen, setIsAddCustomersOpen] = useState(false);
  const [isEditMessageOpen, setIsEditMessageOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

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
          if (configData.tariffPerSegment !== undefined) setTariffPerSegment(configData.tariffPerSegment);
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

  // Safe retry of failed or timed-out recipients
  const handleRetryFailed = async (batchId?: string) => {
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
        body: JSON.stringify(batchId ? { batchId } : {}),
      });

      if (!resetRes.ok) {
        const errData = await resetRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to queue retries');
      }

      setRetryMessage('Failed messages reset. Now sending retries safely...');

      // 2. Dispatch batch sending for the pending retried recipients
      let remaining = 1;
      while (remaining > 0) {
        const sendRes = await fetch(`/api/campaigns/${id}/send-batch`, {
          method: 'POST',
          headers,
          body: JSON.stringify(batchId ? { batchId } : {}),
        });

        if (!sendRes.ok) {
          const sendErr = await sendRes.json().catch(() => ({}));
          throw new Error(sendErr.error || 'Batch retry failed');
        }

        const sendData = await sendRes.json();
        remaining = sendData.remainingPending || 0;
      }

      setRetryMessage('Retry dispatch completed successfully.');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error executing retry';
      setError(msg);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!campaign) return;
    const willArchive = !campaign.isArchived;
    const confirmMsg = willArchive
      ? 'Close this campaign? When closed, no new customer batches can be added unless reopened.'
      : 'Reopen this campaign to allow adding and sending new batches?';

    if (!confirm(confirmMsg)) return;

    setIsArchiving(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessKey) {
        headers['x-app-access-key'] = accessKey;
      }

      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isArchived: willArchive }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update campaign state');
      }

      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDownloadCsv = (batchId?: string) => {
    const url = batchId
      ? `/api/campaigns/${id}/export?batchId=${batchId}`
      : `/api/campaigns/${id}/export`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign_${id}_results.csv`;
    a.click();
  };

  const recipients = campaign?.recipients || [];
  const batches: CampaignBatchRecord[] = campaign?.batches || [];

  // Filter recipients by selected batch and status/search
  const filteredRecipients = recipients.filter((r) => {
    // 1. Batch filter
    if (selectedBatchId !== 'all') {
      if (r.batchId !== selectedBatchId) return false;
    }

    // 2. Status filter
    if (recipientFilter !== 'all') {
      if (recipientFilter === 'PENDING') {
        if (r.status !== 'PENDING' && r.status !== 'TIMEOUT_UNCONFIRMED') return false;
      } else if (r.status !== recipientFilter) {
        return false;
      }
    }

    // 3. Search query
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

  const selectedBatch =
    selectedBatchId !== 'all' ? batches.find((b) => b.id === selectedBatchId) : null;

  // Selected scope failed count for retry button
  const currentScopeFailedCount = selectedBatch
    ? selectedBatch.failedCount
    : campaign?.failedCount || 0;

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
                {campaign?.isArchived && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-300">
                    Closed
                  </span>
                )}
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

          <div className="flex flex-wrap items-center gap-2">
            {/* Add Customers Action */}
            <button
              type="button"
              onClick={() => setIsAddCustomersOpen(true)}
              disabled={campaign?.isArchived || campaign?.status === 'SENDING'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
              title={
                campaign?.isArchived
                  ? 'Campaign is closed. Reopen to add more customers.'
                  : 'Upload an additional contact list to this campaign'
              }
            >
              <UserPlus className="h-4 w-4" />
              <span>Add Customers</span>
            </button>

            {/* Edit Message Action */}
            <button
              type="button"
              onClick={() => setIsEditMessageOpen(true)}
              disabled={campaign?.isArchived}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                campaign?.isArchived
                  ? 'Campaign is closed. Reopen to edit message.'
                  : 'Edit the campaign default message'
              }
            >
              <Edit3 className="h-3.5 w-3.5 text-blue-600" />
              <span>Edit Message</span>
            </button>

            {/* Close / Reopen Toggle */}
            {campaign && (
              <button
                type="button"
                onClick={handleToggleArchive}
                disabled={isArchiving}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                title={campaign.isArchived ? 'Reopen campaign' : 'Close campaign'}
              >
                {campaign.isArchived ? (
                  <>
                    <Unlock className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Reopen</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5 text-slate-500" />
                    <span>Close</span>
                  </>
                )}
              </button>
            )}

            {/* Safe Retry Button */}
            {currentScopeFailedCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  handleRetryFailed(selectedBatchId !== 'all' ? selectedBatchId : undefined)
                }
                disabled={isRetrying}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors shadow-2xs disabled:opacity-50"
              >
                <RotateCcw className={`h-3.5 w-3.5 text-amber-700 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>
                  {isRetrying
                    ? 'Retrying Failed...'
                    : `Retry Failed (${currentScopeFailedCount})`}
                </span>
              </button>
            )}

            {/* Export CSV */}
            <button
              type="button"
              onClick={() =>
                handleDownloadCsv(selectedBatchId !== 'all' ? selectedBatchId : undefined)
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              title={
                selectedBatchId !== 'all'
                  ? 'Export results for this batch'
                  : 'Export all results across all batches'
              }
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>
                {selectedBatchId !== 'all'
                  ? `Export ${selectedBatch?.name || 'Batch'} CSV`
                  : 'Export All Batches CSV'}
              </span>
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={() => setRefreshTrigger((prev) => prev + 1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              title="Refresh details"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Notices */}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-900">Notice</p>
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
              <span className="text-xs font-medium text-slate-500">
                {selectedBatch ? 'Batch Recipients' : 'Total Unique Recipients'}
              </span>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {selectedBatch ? selectedBatch.totalRecipients : campaign.totalRecipients}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs">
              <span className="text-xs font-medium text-emerald-800 flex items-center gap-1">
                <Send className="h-3.5 w-3.5 text-emerald-600" />
                Submitted
              </span>
              <p className="mt-1 text-2xl font-bold text-emerald-900">
                {selectedBatch ? selectedBatch.submittedCount : campaign.submittedCount}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-2xs">
              <span className="text-xs font-medium text-blue-800 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                Delivered
              </span>
              <p className="mt-1 text-2xl font-bold text-blue-900">
                {selectedBatch ? selectedBatch.deliveredCount : campaign.deliveredCount}
              </p>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-2xs">
              <span className="text-xs font-medium text-rose-800 flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-rose-600" />
                Failed
              </span>
              <p className="mt-1 text-2xl font-bold text-rose-900">
                {selectedBatch ? selectedBatch.failedCount : campaign.failedCount}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-2xs">
              <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Pending / Timeout
              </span>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {selectedBatch ? selectedBatch.pendingCount : campaign.pendingCount}
              </p>
            </div>
          </section>
        )}

        {/* Batches Section */}
        {batches.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-700" />
                <h2 className="text-sm font-bold text-slate-900">
                  Sending Batches ({batches.length})
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Select a batch to filter customer logs and view that batch&apos;s specific message snapshot.
              </p>
            </div>

            {/* Batch Selector Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSelectedBatchId('all')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  selectedBatchId === 'all'
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All Batches ({recipients.length})
              </button>

              {batches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBatchId(b.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    selectedBatchId === b.id
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>{b.name || `Batch ${b.batchNumber}`}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      selectedBatchId === b.id
                        ? 'bg-blue-800 text-blue-100'
                        : 'bg-white text-slate-600'
                    }`}
                  >
                    {b.totalRecipients}
                  </span>
                </button>
              ))}
            </div>

            {/* Selected Batch Details Sub-card */}
            {selectedBatch && (
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3.5 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-blue-950">
                    <span>{selectedBatch.name || `Batch ${selectedBatch.batchNumber}`} Details</span>
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] text-blue-800">
                      Status: {selectedBatch.status}
                    </span>
                  </div>
                  <span className="text-slate-500 text-[11px]">
                    Created: {new Date(selectedBatch.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 font-semibold text-slate-700 pt-1">
                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                  <span>Batch Message Snapshot:</span>
                </div>
                <div className="rounded bg-white p-2.5 border border-blue-100 font-mono text-[11px] text-slate-800 whitespace-pre-wrap">
                  {selectedBatch.messageText}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Message Template Card (Overall campaign template if All Batches selected) */}
        {campaign && selectedBatchId === 'all' && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                Campaign Message Template
              </div>
              <div className="flex items-center gap-3">
                {!campaign.isArchived && (
                  <button
                    type="button"
                    onClick={() => setIsEditMessageOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>Edit Message</span>
                  </button>
                )}
                {campaign.estimatedCost !== null && campaign.estimatedCost !== undefined && (
                  <div className="text-xs text-slate-600">
                    Initial Est. Cost:{' '}
                    <span className="font-bold text-slate-900">
                      {campaign.estimatedCost.toFixed(2)} {currency}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono">
              {campaign.messageTemplate}
            </p>
          </section>
        )}

        {/* Recipient Results Table Section */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Recipient Outcomes ({filteredRecipients.length}
                {filteredRecipients.length !== recipients.length ? ` of ${recipients.length}` : ''})
              </h2>
              <p className="text-xs text-slate-500">
                Phone numbers are masked for privacy. Provider message IDs are reconciled upon delivery.
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
                All
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

          {/* Table */}
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Customer Name</th>
                  <th className="px-4 py-3 font-mono">Masked Phone</th>
                  <th className="px-4 py-3 text-center">Batch</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 font-mono">Provider Message ID</th>
                  <th className="px-4 py-3">Dispatched / Updated</th>
                  <th className="px-4 py-3">Details / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Loading recipients...
                    </td>
                  </tr>
                ) : filteredRecipients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No recipients matching current filter.
                    </td>
                  </tr>
                ) : (
                  filteredRecipients.map((r) => {
                    const batchForRecipient = batches.find((b) => b.id === r.batchId);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {r.recipientName || 'Customer'}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">{r.maskedPhone}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            {batchForRecipient?.name || (batchForRecipient?.batchNumber ? `Batch ${batchForRecipient.batchNumber}` : 'Batch 1')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.status === 'DELIVERED' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                              <CheckCircle2 className="h-3 w-3 text-blue-600" />
                              Delivered
                            </span>
                          )}
                          {r.status === 'SUBMITTED' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                              <Send className="h-3 w-3 text-emerald-600" />
                              Submitted
                            </span>
                          )}
                          {r.status === 'FAILED' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800 border border-rose-200">
                              <XCircle className="h-3 w-3 text-rose-600" />
                              Failed
                            </span>
                          )}
                          {(r.status === 'PENDING' || r.status === 'TIMEOUT_UNCONFIRMED') && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                              <Clock className="h-3 w-3 text-slate-400" />
                              {r.status === 'TIMEOUT_UNCONFIRMED' ? 'Timeout Unconfirmed' : 'Pending'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600 text-[11px]">
                          {r.providerMessageId ? (
                            <span>{r.providerMessageId}</span>
                          ) : (
                            <span className="text-slate-400 italic">None</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-500 text-[11px]">
                          {r.submittedAt
                            ? new Date(r.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : new Date(r.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-500 max-w-xs truncate">
                          {r.failureReason ? (
                            <span className="text-rose-700 font-semibold">{r.failureReason}</span>
                          ) : r.retryCount > 0 ? (
                            <span className="text-amber-700">Retried ({r.retryCount}x)</span>
                          ) : (
                            <span>{r.providerStatus || 'Standard delivery'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Add Customers Modal */}
      {campaign && (
        <AddCustomersModal
          isOpen={isAddCustomersOpen}
          onClose={() => setIsAddCustomersOpen(false)}
          campaignId={campaign.id}
          campaignName={campaign.name}
          defaultMessageTemplate={campaign.messageTemplate}
          existingRecipients={recipients}
          accessKey={accessKey}
          tariffPerSegment={tariffPerSegment}
          currency={currency}
          onBatchCreated={() => setRefreshTrigger((prev) => prev + 1)}
        />
      )}

      {campaign && (
        <EditCampaignMessageModal
          isOpen={isEditMessageOpen}
          onClose={() => setIsEditMessageOpen(false)}
          campaignId={campaign.id}
          campaignName={campaign.name}
          currentMessage={campaign.messageTemplate}
          isArchived={Boolean(campaign.isArchived)}
          accessKey={accessKey}
          tariffPerSegment={tariffPerSegment}
          currency={currency}
          onMessageSaved={(newMsg) => {
            setCampaign((prev) => (prev ? { ...prev, messageTemplate: newMsg } : null));
            setRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}

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

export default function CampaignDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-xs text-slate-500">Loading campaign details...</div>
        </div>
      }
    >
      <CampaignDetailsContent params={params} />
    </Suspense>
  );
}
