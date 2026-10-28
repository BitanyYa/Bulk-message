'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { AccessKeyModal } from '@/components/AccessKeyModal';
import { FileUploadSection } from '@/components/FileUploadSection';
import { CustomerPreviewTable } from '@/components/CustomerPreviewTable';
import { SmsComposer } from '@/components/SmsComposer';
import { SendConfirmationModal } from '@/components/SendConfirmationModal';
import { SendingProgressSection } from '@/components/SendingProgressSection';
import {
  ParseResult,
  ColumnMapping,
  RecipientRecord,
  RecipientSendResult,
  CampaignRecord,
} from '@/types';
import { analyzeSmsMessage, findUnresolvedPlaceholders } from '@/lib/sms';
import { MAX_RECIPIENTS_PER_CAMPAIGN } from '@/lib/parser';
import { Send, AlertCircle, ArrowLeft, PlusCircle } from 'lucide-react';

function NewCampaignContent() {
  // 1. App Configuration & Access Key
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

  // 2. Campaign Metadata & File State
  const [campaignName, setCampaignName] = useState('SMS Campaign');

  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [recipients, setRecipients] = useState<RecipientRecord[]>([]);
  const [currentMapping, setCurrentMapping] = useState<ColumnMapping | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 3. SMS Message State
  const [message, setMessage] = useState(
    'Hello {{name}}, thank you for choosing Yonas Mobile! We appreciate your trust in us.'
  );

  // 4. Campaign Orchestration State
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [createdCampaign, setCreatedCampaign] = useState<CampaignRecord | null>(null);
  const [campaignResults, setCampaignResults] = useState<RecipientSendResult[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Load app config on mount
  useEffect(() => {
    let active = true;

    const fetchConfig = async () => {
      try {
        const today = new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        if (active) {
          setCampaignName(`Campaign - ${today}`);
        }

        const res = await fetch('/api/config');
        if (res.ok && active) {
          const data = await res.json();
          setAuthRequired(Boolean(data.authRequired));
          setProviderConfigured(Boolean(data.providerConfigured));
          if (data.senderName) setSenderName(data.senderName);
          if (data.tariffPerSegment !== undefined) setTariffPerSegment(data.tariffPerSegment);
          if (data.currency) setCurrency(data.currency);
          if (data.balance) setBalance(data.balance);
        }
      } catch {
        // fallback
      }
    };

    fetchConfig();

    return () => {
      active = false;
    };
  }, []);

  const searchParams = useSearchParams();
  const templateId = searchParams.get('templateId');

  // Load message from template if templateId provided in query params
  useEffect(() => {
    if (!templateId) return;
    let active = true;

    async function loadTemplate() {
      try {
        const headers: Record<string, string> = {};
        if (accessKey) headers['x-app-access-key'] = accessKey;
        const res = await fetch(`/api/templates/${templateId}`, { headers });
        if (res.ok && active) {
          const data = await res.json();
          if (data.body) {
            setMessage(data.body);
          }
        }
      } catch {
        // fallback
      }
    }

    loadTemplate();
    return () => {
      active = false;
    };
  }, [templateId, accessKey]);

  const handleSaveAccessKey = (key: string) => {
    setAccessKey(key);
    sessionStorage.setItem('yonas_sms_access_key', key);
  };

  const handleParseComplete = (result: ParseResult, file: File) => {
    setParseResult(result);
    setUploadedFile(file);
    setRecipients(result.recipients || []);
    setCurrentMapping(result.detectedMapping);
    setCampaignResults([]);
    setCreatedCampaign(null);
    setGlobalError(null);
  };

  const handleUpdateMapping = async (newMapping: ColumnMapping) => {
    if (!uploadedFile) return;
    setIsLoading(true);
    setGlobalError(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);
      formData.append('mapping', JSON.stringify(newMapping));

      const res = await fetch('/api/parse-file', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to re-parse columns');
      }

      const data: ParseResult = await res.json();
      setParseResult(data);
      setRecipients(data.recipients || []);
      setCurrentMapping(data.detectedMapping);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error applying column mapping';
      setGlobalError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleRecipient = (id: string) => {
    setRecipients((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleSelectAllValid = () => {
    let count = 0;
    setRecipients((prev) =>
      prev.map((r) => {
        if (r.status === 'valid' && count < MAX_RECIPIENTS_PER_CAMPAIGN) {
          count++;
          return { ...r, selected: true };
        }
        return { ...r, selected: false };
      })
    );
  };

  const handleDeselectAll = () => {
    setRecipients((prev) => prev.map((r) => ({ ...r, selected: false })));
  };

  const selectedRecipients = useMemo(() => {
    return recipients.filter((r) => r.selected && r.status === 'valid');
  }, [recipients]);

  const smsAnalysis = useMemo(() => {
    return analyzeSmsMessage(message);
  }, [message]);

  const unresolvedPlaceholders = useMemo(() => {
    return findUnresolvedPlaceholders(message);
  }, [message]);

  const isMessageValid = message.trim().length > 0 && unresolvedPlaceholders.length === 0;

  const campaignSegmentsTotal = useMemo(() => {
    if (selectedRecipients.length === 0 || !isMessageValid) return 0;
    return selectedRecipients.length * smsAnalysis.segmentCount;
  }, [selectedRecipients, smsAnalysis, isMessageValid]);

  const estimatedTotalCost = useMemo(() => {
    if (tariffPerSegment === null || campaignSegmentsTotal === 0) return null;
    return campaignSegmentsTotal * tariffPerSegment;
  }, [tariffPerSegment, campaignSegmentsTotal]);

  const canTriggerSend =
    selectedRecipients.length > 0 &&
    selectedRecipients.length <= MAX_RECIPIENTS_PER_CAMPAIGN &&
    isMessageValid &&
    campaignName.trim().length > 0 &&
    !isSending;

  // Execute Batch Sending Workflow with Persistence
  const handleStartCampaign = async () => {
    setIsConfirmationOpen(false);
    setIsSending(true);
    setGlobalError(null);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (accessKey) {
      headers['x-app-access-key'] = accessKey;
    }

    try {
      // 1. Create persistent campaign in PostgreSQL
      const createRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: campaignName.trim(),
          originalFilename: uploadedFile?.name || null,
          messageTemplate: message,
          estimatedCost: estimatedTotalCost,
          recipients: selectedRecipients.map((r) => ({
            name: r.rawName,
            phone: r.normalizedPhone,
            maskedPhone: r.maskedPhone,
          })),
        }),
      });

      if (!createRes.ok) {
        const createErr = await createRes.json().catch(() => ({}));
        if (createRes.status === 401) {
          setIsAccessModalOpen(true);
          throw new Error('Access authorization required to create a campaign.');
        }
        throw new Error(createErr.error || 'Failed to create campaign in database');
      }

      const { campaign: initialCampaign } = await createRes.json();
      setCreatedCampaign(initialCampaign);

      const campaignId = initialCampaign.id;

      // 2. Loop through micro-batches to send via provider
      let remaining = initialCampaign.pendingCount;

      while (remaining > 0) {
        const batchRes = await fetch(`/api/campaigns/${campaignId}/send-batch`, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });

        if (!batchRes.ok) {
          const batchErr = await batchRes.json().catch(() => ({}));
          throw new Error(batchErr.error || 'Batch sending encountered an error');
        }

        const batchData = await batchRes.json();
        remaining = batchData.remainingPending ?? 0;

        if (batchData.campaign) {
          setCreatedCampaign(batchData.campaign);
        }

        // Fetch latest detailed recipient results
        const detailsRes = await fetch(`/api/campaigns/${campaignId}`, { headers });
        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          if (detailsData.recipients) {
            setCampaignResults(
              detailsData.recipients.map((r: {
                id: string;
                recipientName?: string | null;
                phone: string;
                maskedPhone: string;
                status: string;
                providerMessageId?: string | null;
                failureReason?: string | null;
                updatedAt: string;
              }) => ({
                recipientId: r.id,
                name: r.recipientName || 'Customer',
                phone: r.phone,
                maskedPhone: r.maskedPhone,
                status: r.status.toLowerCase() as RecipientSendResult['status'],
                messageId: r.providerMessageId || undefined,
                error: r.failureReason || undefined,
                timestamp: r.updatedAt,
              }))
            );
          }
        }

        if (batchData.batchProcessed === 0) {
          break;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error sending campaign';
      setGlobalError(msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!createdCampaign) return;
    setIsSending(true);
    setGlobalError(null);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (accessKey) {
      headers['x-app-access-key'] = accessKey;
    }

    try {
      const retryRes = await fetch(`/api/campaigns/${createdCampaign.id}/retry`, {
        method: 'POST',
        headers,
      });

      if (!retryRes.ok) {
        const retryErr = await retryRes.json().catch(() => ({}));
        throw new Error(retryErr.error || 'Failed to initialize retry');
      }

      let remaining = 1;
      while (remaining > 0) {
        const batchRes = await fetch(`/api/campaigns/${createdCampaign.id}/send-batch`, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });

        if (!batchRes.ok) {
          break;
        }

        const batchData = await batchRes.json();
        remaining = batchData.remainingPending ?? 0;
      }

      // Refresh final results
      const detailsRes = await fetch(`/api/campaigns/${createdCampaign.id}`, { headers });
      if (detailsRes.ok) {
        const detailsData = await detailsRes.json();
        setCreatedCampaign(detailsData);
        if (detailsData.recipients) {
          setCampaignResults(
            detailsData.recipients.map((r: {
              id: string;
              recipientName?: string | null;
              phone: string;
              maskedPhone: string;
              status: string;
              providerMessageId?: string | null;
              failureReason?: string | null;
              updatedAt: string;
            }) => ({
              recipientId: r.id,
              name: r.recipientName || 'Customer',
              phone: r.phone,
              maskedPhone: r.maskedPhone,
              status: r.status.toLowerCase() as RecipientSendResult['status'],
              messageId: r.providerMessageId || undefined,
              error: r.failureReason || undefined,
              timestamp: r.updatedAt,
            }))
          );
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error retrying campaign';
      setGlobalError(msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleStartNewCampaign = () => {
    setParseResult(null);
    setUploadedFile(null);
    setRecipients([]);
    setCurrentMapping(null);
    setCampaignResults([]);
    setCreatedCampaign(null);
    setGlobalError(null);
    setCampaignName(`Campaign - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);
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
        {/* Top Breadcrumb */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl flex items-center gap-2">
                <PlusCircle className="h-6 w-6 text-blue-700" />
                Create New SMS Campaign
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                Upload customer contacts, personalize message content, and dispatch via AfroMessage.
              </p>
            </div>
          </div>
        </div>

        {/* Global Error Banner */}
        {globalError && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-xs text-rose-800 shadow-xs flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-900">Campaign Operation Notice</p>
              <p className="mt-0.5 text-rose-800">{globalError}</p>
            </div>
          </div>
        )}

        {/* Campaign Name Field */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <label htmlFor="campaignName" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Campaign Name
          </label>
          <input
            id="campaignName"
            type="text"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="e.g., Year-End Promotional Blast"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm shadow-xs focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 font-semibold"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            A descriptive title to identify this campaign in your dashboard and history.
          </p>
        </section>

        {/* Step 1: Upload File */}
        <FileUploadSection
          onParseComplete={handleParseComplete}
          onUpdateMapping={handleUpdateMapping}
          parseResult={parseResult}
          currentMapping={currentMapping}
          uploadedFileName={uploadedFile?.name || null}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />

        {/* Step 2: Customer Preview Table */}
        {recipients.length > 0 && (
          <CustomerPreviewTable
            recipients={recipients}
            onToggleRecipient={handleToggleRecipient}
            onSelectAllValid={handleSelectAllValid}
            onDeselectAll={handleDeselectAll}
            selectedCount={selectedRecipients.length}
          />
        )}

        {/* Step 3: SMS Composer */}
        {recipients.length > 0 && (
          <SmsComposer
            message={message}
            onChangeMessage={setMessage}
            selectedRecipients={selectedRecipients}
          />
        )}

        {/* Step 4: Dispatch Campaign Bar */}
        {recipients.length > 0 && !createdCampaign && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Ready to Dispatch Campaign
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Targeting{' '}
                  <span className="font-bold text-slate-900">
                    {selectedRecipients.length} valid recipient
                    {selectedRecipients.length === 1 ? '' : 's'}
                  </span>{' '}
                  ({campaignSegmentsTotal} total carrier segment
                  {campaignSegmentsTotal === 1 ? '' : 's'}).
                  {estimatedTotalCost !== null && (
                    <span className="ml-1 text-blue-700 font-semibold">
                      Estimated: ~{estimatedTotalCost.toFixed(2)} {currency}
                    </span>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsConfirmationOpen(true)}
                disabled={!canTriggerSend}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-6 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all"
              >
                <Send className="h-4 w-4" />
                Review & Dispatch Campaign
              </button>
            </div>
          </section>
        )}

        {/* Step 5: Sending Progress & Results */}
        {(campaignResults.length > 0 || isSending || createdCampaign) && (
          <div className="space-y-4">
            <SendingProgressSection
              results={campaignResults}
              totalExpected={selectedRecipients.length}
              isSending={isSending}
              onRetryFailed={handleRetryFailed}
              onStartNewCampaign={handleStartNewCampaign}
            />

            {createdCampaign && (
              <div className="flex items-center justify-end">
                <Link
                  href={`/campaigns/${createdCampaign.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 underline"
                >
                  <span>Open Persistent Campaign Details Page</span>
                </Link>
              </div>
            )}
          </div>
        )}
      </main>

      <SendConfirmationModal
        isOpen={isConfirmationOpen}
        onClose={() => setIsConfirmationOpen(false)}
        onConfirmSend={handleStartCampaign}
        recipientCount={selectedRecipients.length}
        segmentsPerMessage={smsAnalysis.segmentCount}
        totalSegments={campaignSegmentsTotal}
        estimatedCost={estimatedTotalCost}
        currency={currency}
        senderName={senderName}
        isSending={isSending}
      />

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

export default function NewCampaignPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-xs text-slate-500">Loading campaign creator...</div>
        </div>
      }
    >
      <NewCampaignContent />
    </Suspense>
  );
}

