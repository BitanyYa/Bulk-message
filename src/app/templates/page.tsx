'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { AccessKeyModal } from '@/components/AccessKeyModal';
import { MessageTemplateRecord } from '@/types';
import { analyzeSmsMessage, personalizeMessage, findUnresolvedPlaceholders } from '@/lib/sms';
import {
  FileText,
  PlusCircle,
  Search,
  Edit2,
  Archive,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  X,
  RotateCcw,
} from 'lucide-react';

export default function TemplatesPage() {
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

  // Templates list state
  const [templates, setTemplates] = useState<MessageTemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [search, setSearch] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modal State (Create / Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplateRecord | null>(null);
  const [formName, setFormName] = useState('');
  const [formBody, setFormBody] = useState('');
  const [previewCustomerName, setPreviewCustomerName] = useState('Abebe Bikila');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;

    async function loadTemplates() {
      setLoading(true);
      setError(null);
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
        params.set('status', activeTab);
        if (search.trim()) params.set('search', search.trim());
        params.set('pageSize', '50');

        const headers: Record<string, string> = {};
        if (accessKey) {
          headers['x-app-access-key'] = accessKey;
        }

        const res = await fetch(`/api/templates?${params.toString()}`, { headers });
        if (!res.ok) {
          if (res.status === 401 && active) {
            setIsAccessModalOpen(true);
            setError('Access key required or unauthorized');
            return;
          }
          const data = await res.json();
          throw new Error(data.error || 'Failed to load templates');
        }

        const data = await res.json();
        if (active) {
          setTemplates(data.templates || []);
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : 'Error fetching templates';
          setError(msg);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadTemplates();

    return () => {
      active = false;
    };
  }, [activeTab, search, accessKey, refreshTrigger]);

  const handleOpenCreateModal = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormBody('Dear {{name}}, thank you for shopping with Yonas Mobile! Enjoy 15% off your next purchase.');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (t: MessageTemplateRecord) => {
    setEditingTemplate(t);
    setFormName(t.name);
    setFormBody(t.body);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleInsertTag = (tag: string) => {
    if (!textareaRef.current) {
      setFormBody((prev) => prev + tag);
      return;
    }
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const nextText = formBody.substring(0, start) + tag + formBody.substring(end);
    setFormBody(nextText);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + tag.length, start + tag.length);
      }
    }, 50);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Template name is required.');
      return;
    }
    if (!formBody.trim()) {
      setFormError('Message text is required.');
      return;
    }

    const invalidPlaceholders = findUnresolvedPlaceholders(formBody);
    if (invalidPlaceholders.length > 0) {
      setFormError(`Unsupported placeholder(s): ${invalidPlaceholders.join(', ')}. Only {{name}} is supported.`);
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessKey) {
        headers['x-app-access-key'] = accessKey;
      }

      const url = editingTemplate ? `/api/templates/${editingTemplate.id}` : '/api/templates';
      const method = editingTemplate ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify({
          name: formName.trim(),
          body: formBody.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save template');
      }

      setIsModalOpen(false);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving template';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveTemplate = async (template: MessageTemplateRecord) => {
    const isCurrentlyArchived = template.isArchived;
    const confirmMsg = isCurrentlyArchived
      ? `Restore "${template.name}" to active templates?`
      : `Archive template "${template.name}"? It will not appear in the new campaign picker until restored.`;

    if (!confirm(confirmMsg)) return;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessKey) {
        headers['x-app-access-key'] = accessKey;
      }

      if (isCurrentlyArchived) {
        // Restore
        const res = await fetch(`/api/templates/${template.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ isArchived: false }),
        });
        if (!res.ok) throw new Error('Failed to restore template');
      } else {
        // Archive
        const res = await fetch(`/api/templates/${template.id}`, {
          method: 'DELETE',
          headers,
        });
        if (!res.ok) throw new Error('Failed to archive template');
      }

      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    }
  };

  // Live Analysis for Form
  const samplePersonalized = personalizeMessage(formBody, previewCustomerName);
  const smsAnalysis = analyzeSmsMessage(samplePersonalized);
  const unresolvedInForm = findUnresolvedPlaceholders(formBody);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <Header
        accessKey={accessKey}
        onOpenAccessModal={() => setIsAccessModalOpen(true)}
        authRequired={authRequired}
        providerConfigured={providerConfigured}
        senderName={senderName}
        balance={balance}
      />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Top Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <FileText className="h-6 w-6 text-blue-700" />
              <span>Message Templates</span>
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Create, customize, and manage reusable SMS campaign templates with dynamic <code className="bg-slate-100 text-blue-700 px-1 py-0.5 rounded text-xs">{'{{name}}'}</code> personalization.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            <span>New Template</span>
          </button>
        </div>

        {/* Search & Tabs */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Active / Archived Tabs */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                activeTab === 'active'
                  ? 'bg-blue-50 text-blue-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active Templates
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('archived')}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                activeTab === 'archived'
                  ? 'bg-blue-50 text-blue-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Archived
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs text-slate-800 placeholder-slate-400 shadow-2xs focus:border-blue-600 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
            <div className="flex-1 text-xs">
              <span className="font-semibold">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setRefreshTrigger((prev) => prev + 1)}
              className="rounded p-1 text-rose-600 hover:bg-rose-100"
              title="Retry"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Templates Grid / Empty State */}
        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
              <span>Loading templates...</span>
            </div>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 mb-3">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No {activeTab} templates found</h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              {activeTab === 'active'
                ? 'Create reusable message templates to speed up launching future campaigns.'
                : 'No archived templates currently.'}
            </p>
            {activeTab === 'active' && (
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Create First Template</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => {
              const preview = personalizeMessage(template.body, 'Abebe Bikila');
              const analysis = analyzeSmsMessage(preview);

              return (
                <div
                  key={template.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-blue-300 transition-all"
                >
                  <div>
                    {/* Top title and status */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-bold text-slate-900 text-sm leading-snug">
                        {template.name}
                      </h3>
                      {template.isArchived && (
                        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          Archived
                        </span>
                      )}
                    </div>

                    {/* Message Body Box */}
                    <div className="rounded-lg bg-slate-50 p-3 border border-slate-100 text-xs text-slate-700 font-mono whitespace-pre-wrap leading-relaxed line-clamp-4 min-h-[72px]">
                      {template.body}
                    </div>

                    {/* Badges: Segments & Encoding */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                        {analysis.segmentCount} {analysis.segmentCount === 1 ? 'Segment' : 'Segments'}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                        {analysis.encoding}
                      </span>
                      {analysis.hasUnicode && (
                        <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                          Unicode
                        </span>
                      )}
                      <span className="text-slate-400 ml-auto">
                        {template.body.length} chars
                      </span>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(template)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        title="Edit template"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleArchiveTemplate(template)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        title={template.isArchived ? 'Restore template' : 'Archive template'}
                      >
                        {template.isArchived ? (
                          <>
                            <RotateCcw className="h-3 w-3 text-emerald-600" />
                            <span>Restore</span>
                          </>
                        ) : (
                          <>
                            <Archive className="h-3 w-3 text-slate-500" />
                            <span>Archive</span>
                          </>
                        )}
                      </button>
                    </div>

                    {!template.isArchived && (
                      <Link
                        href={`/campaigns/new?templateId=${template.id}`}
                        className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900"
                      >
                        <span>Use in Campaign</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create / Edit Template Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
            <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-700" />
                  <span>{editingTemplate ? 'Edit Message Template' : 'Create New Message Template'}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Saved templates can be selected when drafting campaigns. Any change made here will not alter historical or active campaigns.
                </p>
              </div>

              {formError && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
                  {formError}
                </div>
              )}

              <form onSubmit={handleSaveTemplate} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. VIP Holiday Promotion, Order Receipt..."
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-hidden"
                  />
                </div>

                {/* Message Body */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Message Body *
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">Insert tag:</span>
                      <button
                        type="button"
                        onClick={() => handleInsertTag('{{name}}')}
                        className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                        title="Insert dynamic customer name"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>{'{{name}}'}</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    ref={textareaRef}
                    rows={4}
                    required
                    placeholder="Write your message here... Use {{name}} to personalize with recipient's name."
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-3 text-xs text-slate-900 font-mono focus:border-blue-600 focus:outline-hidden"
                  />

                  {/* Character, Segment & Encoding Stats */}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">
                        {smsAnalysis.charCount} characters
                      </span>
                      <span>•</span>
                      <span className={`font-semibold ${smsAnalysis.segmentCount > 1 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {smsAnalysis.segmentCount} {smsAnalysis.segmentCount === 1 ? 'SMS Segment' : 'SMS Segments'}
                      </span>
                      <span>•</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 font-mono">
                        {smsAnalysis.encoding} ({smsAnalysis.charsPerSegment} chars/seg)
                      </span>
                    </div>

                    <span>
                      {smsAnalysis.charsRemainingInSegment} chars left in segment
                    </span>
                  </div>

                  {/* Placeholder validation warning */}
                  {unresolvedInForm.length > 0 && (
                    <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200">
                      <span className="font-semibold">Unsupported placeholder detected:</span>{' '}
                      {unresolvedInForm.join(', ')}. Only <code className="font-mono bg-white px-1 py-0.5 rounded">{'{{name}}'}</code> is valid.
                    </div>
                  )}

                  {smsAnalysis.hasUnicode && (
                    <div className="mt-2 text-[11px] text-amber-700">
                      💡 Contains Unicode characters (limit is 70 chars per segment instead of 160).
                    </div>
                  )}
                </div>

                {/* Live Preview Card */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-blue-700" />
                      <span>Live Personalization Preview</span>
                    </span>

                    <div className="flex items-center gap-1 text-[11px] text-slate-600">
                      <span>Simulate customer:</span>
                      <input
                        type="text"
                        value={previewCustomerName}
                        onChange={(e) => setPreviewCustomerName(e.target.value)}
                        className="w-28 rounded border border-blue-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-800 focus:outline-hidden"
                        placeholder="Customer name"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-white p-3 border border-blue-100 text-xs text-slate-800 font-sans shadow-2xs whitespace-pre-wrap leading-relaxed">
                    {samplePersonalized || <span className="text-slate-400 italic">Message preview will appear here...</span>}
                  </div>
                </div>

                {/* Modal Footer Buttons */}
                <div className="mt-6 flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>{editingTemplate ? 'Update Template' : 'Save Template'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <AccessKeyModal
        isOpen={isAccessModalOpen}
        onClose={() => setIsAccessModalOpen(false)}
        currentKey={accessKey}
        onSaveKey={(newKey: string) => {
          setAccessKey(newKey);
          setIsAccessModalOpen(false);
          setRefreshTrigger((prev) => prev + 1);
        }}
        authRequired={authRequired}
      />
    </div>
  );
}
