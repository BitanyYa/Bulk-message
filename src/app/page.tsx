'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { AccessKeyModal } from '@/components/AccessKeyModal';
import { DashboardMetrics, CampaignRecord } from '@/types';
import {
  Send,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Coins,
  History,
  ArrowRight,
  PlusCircle,
  AlertTriangle,
  RefreshCw,
  Layers,
  FileText,
} from 'lucide-react';

export default function DashboardPage() {
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

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const configRes = await fetch('/api/config');
        if (configRes.ok && active) {
          const configData = await configRes.json();
          setAuthRequired(Boolean(configData.authRequired));
          setProviderConfigured(Boolean(configData.providerConfigured));
          if (configData.senderName) setSenderName(configData.senderName);
          if (configData.balance) setBalance(configData.balance);
        }

        const headers: Record<string, string> = {};
        if (accessKey) {
          headers['x-app-access-key'] = accessKey;
        }

        const metricsRes = await fetch('/api/dashboard', { headers });
        if (metricsRes.ok && active) {
          const data: DashboardMetrics = await metricsRes.json();
          setMetrics(data);
          if (data.warning) {
            setError(data.warning);
          } else {
            setError(null);
          }
        } else if (metricsRes.status === 401 && active) {
          setError('Access authorization required to view dashboard metrics.');
          setIsAccessModalOpen(true);
        } else if (active) {
          const errData = await metricsRes.json().catch(() => ({}));
          setError(errData.error || 'Failed to fetch dashboard metrics.');
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

    loadData();

    return () => {
      active = false;
    };
  }, [accessKey, refreshTrigger]);

  const handleManualRefresh = () => {
    setLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleSaveAccessKey = (key: string) => {
    setAccessKey(key);
    sessionStorage.setItem('yonas_sms_access_key', key);
  };

  const getStatusBadge = (status: CampaignRecord['status']) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
            Completed
          </span>
        );
      case 'SENDING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
            Sending
          </span>
        );
      case 'PARTIALLY_FAILED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-600"></span>
            Partially Failed
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 border border-rose-200">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-600"></span>
            Failed
          </span>
        );
      case 'INTERRUPTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 border border-slate-300">
            Interrupted
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
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

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 space-y-8">
        {/* Top Banner / Welcome */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-700 to-blue-900 p-6 text-white shadow-sm">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Campaign Operations Dashboard
            </h1>
            <p className="mt-1 text-xs text-blue-100 sm:text-sm">
              Real-time campaign history, delivery reconciliation, and persistent SMS dispatch.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <Link
              href="/templates"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
            >
              <FileText className="h-4 w-4" />
              <span>Templates</span>
            </Link>

            <Link
              href="/campaigns/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-bold text-blue-800 shadow-sm hover:bg-blue-50 transition-colors"
            >
              <PlusCircle className="h-4 w-4 text-blue-700" />
              <span>New Campaign</span>
            </Link>
          </div>
        </div>

        {/* Error notice if authorization or database error occurs */}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-900">Dashboard Notice</p>
              <p className="mt-0.5 text-rose-800">{error}</p>
            </div>
          </div>
        )}

        {/* Real Database Metrics Cards */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Aggregated Campaign Statistics
            </h2>
            <span className="text-[11px] text-slate-500">
              Sourced from PostgreSQL Database
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {/* Total Campaigns */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-slate-400" />
                Campaigns
              </span>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {metrics ? metrics.totalCampaigns : loading ? '—' : 0}
              </p>
            </div>

            {/* Total Recipients */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-blue-500" />
                Recipients
              </span>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {metrics ? metrics.totalRecipients : loading ? '—' : 0}
              </p>
            </div>

            {/* Submitted to Provider */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-2xs">
              <span className="text-xs font-medium text-emerald-800 flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5 text-emerald-600" />
                Submitted
              </span>
              <p className="mt-2 text-2xl font-bold text-emerald-900">
                {metrics ? metrics.totalSubmitted : loading ? '—' : 0}
              </p>
            </div>

            {/* Confirmed Delivered */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-2xs">
              <span className="text-xs font-medium text-blue-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                Delivered
              </span>
              <p className="mt-2 text-2xl font-bold text-blue-900">
                {metrics ? metrics.totalDelivered : loading ? '—' : 0}
              </p>
            </div>

            {/* Failed */}
            <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 shadow-2xs">
              <span className="text-xs font-medium text-rose-800 flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-rose-600" />
                Failed
              </span>
              <p className="mt-2 text-2xl font-bold text-rose-900">
                {metrics ? metrics.totalFailed : loading ? '—' : 0}
              </p>
            </div>

            {/* Pending / Unknown */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-2xs">
              <span className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Pending
              </span>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {metrics ? metrics.totalPending : loading ? '—' : 0}
              </p>
            </div>
          </div>
        </section>

        {/* AfroMessage Live Provider Status Section */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                <Coins className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  AfroMessage Account & Provider Balance
                </h3>
                <p className="text-[11px] text-slate-500">
                  Official carrier balance queried directly from AfroMessage API.
                </p>
              </div>
            </div>

            {balance ? (
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-slate-500">Available Credits:</span>{' '}
                  <span className="font-bold text-slate-900 text-sm">
                    {balance.balance} ETB
                  </span>
                </div>
                <div className="rounded-md bg-emerald-50 px-2.5 py-1 text-emerald-800 border border-emerald-200 font-semibold">
                  ~ {balance.estimatedMessages} SMS remaining
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-400 italic">
                Balance details available when provider API token is connected.
              </span>
            )}
          </div>
        </section>

        {/* Recent Campaigns Table */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Recent Campaigns
              </h2>
              <p className="text-xs text-slate-500">
                Latest persistent SMS campaigns dispatched from this company workspace.
              </p>
            </div>

            <Link
              href="/campaigns"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
            >
              <span>View Full History</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Campaign Name</th>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3 text-center">Recipients</th>
                  <th className="px-4 py-3 text-center">Submitted</th>
                  <th className="px-4 py-3 text-center">Delivered</th>
                  <th className="px-4 py-3 text-center">Failed</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto text-blue-600 mb-2" />
                      Loading campaigns from database...
                    </td>
                  </tr>
                ) : !metrics || metrics.recentCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Layers className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-medium text-slate-600">No campaigns recorded yet</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Create your first persistent SMS campaign to view real-time tracking here.
                      </p>
                      <Link
                        href="/campaigns/new"
                        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 transition-colors"
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        Create New Campaign
                      </Link>
                    </td>
                  </tr>
                ) : (
                  metrics.recentCampaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {c.name}
                        {c.originalFilename && (
                          <span className="block text-[11px] font-normal text-slate-400">
                            {c.originalFilename}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                        {new Date(c.createdAt).toLocaleDateString()} {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-slate-800">
                        {c.totalRecipients}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-700">
                        {c.submittedCount}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-blue-700">
                        {c.deliveredCount}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-rose-700">
                        {c.failedCount}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(c.status)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          Details
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-6xl px-4">
          Yonas Mobile SMS Sender • Enterprise Campaign Management • Powered by AfroMessage API
        </div>
      </footer>

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
