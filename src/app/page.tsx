'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  SendRecipientItem,
} from '@/types';
import { analyzeSmsMessage, personalizeMessage, findUnresolvedPlaceholders } from '@/lib/sms';
import { MAX_RECIPIENTS_PER_CAMPAIGN } from '@/lib/parser';
import { Send, AlertCircle } from 'lucide-react';

export default function HomePage() {
  // 1. App Configuration & Access Key
  const [authRequired, setAuthRequired] = useState(false);
  const [providerConfigured, setProviderConfigured] = useState(true);
  const [senderName, setSenderName] = useState('YonasMobile');
  const [tariffPerSegment, setTariffPerSegment] = useState<number | null>(0.35);
  const [currency, setCurrency] = useState('ETB');
  const [balance, setBalance] = useState<{ balance: string; estimatedMessages: string } | null>(null);

  const [accessKey, setAccessKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('yonas_sms_access_key') || '';
    }
    return '';
  });
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);

  // 2. File & Parsing State
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
  const [campaignResults, setCampaignResults] = useState<RecipientSendResult[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Load app config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          setAuthRequired(Boolean(data.authRequired));
          setProviderConfigured(Boolean(data.providerConfigured));
          if (data.senderName) setSenderName(data.senderName);
          if (data.tariffPerSegment !== undefined) setTariffPerSegment(data.tariffPerSegment);
          if (data.currency) setCurrency(data.currency);
          if (data.balance) setBalance(data.balance);
        }
      } catch {
        // use default fallback states
      }
    };

    fetchConfig();
  }, []);

  const handleSaveAccessKey = (key: string) => {
    setAccessKey(key);
    sessionStorage.setItem('yonas_sms_access_key', key);
  };

  // Handle file parsing completion
  const handleParseComplete = (result: ParseResult, file: File) => {
    setParseResult(result);
    setUploadedFile(file);
    setRecipients(result.recipients || []);
    setCurrentMapping(result.detectedMapping);
    setCampaignResults([]);
    setActiveCampaignId(null);
    setGlobalError(null);
  };

  // Re-map columns and re-parse file
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

  // Toggle recipient selection
  const handleToggleRecipient = (id: string) => {
    setRecipients((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  // Select all valid recipients
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

  // Deselect all
  const handleDeselectAll = () => {
    setRecipients((prev) => prev.map((r) => ({ ...r, selected: false })));
  };

  // Calculate selected valid recipients
  const selectedRecipients = useMemo(() => {
    return recipients.filter((r) => r.selected && r.status === 'valid');
  }, [recipients]);

  // Message analysis and validation
  const smsAnalysis = useMemo(() => {
    return analyzeSmsMessage(message);
  }, [message]);

  const unresolvedPlaceholders = useMemo(() => {
    return findUnresolvedPlaceholders(message);
  }, [message]);

  const isMessageValid = message.trim().length > 0 && unresolvedPlaceholders.length === 0;

  // Segment calculation for campaign
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
    !isSending;

  // Execute Batch Sending Orchestration
  const executeBatchSend = async (recipientsToSend: RecipientRecord[]) => {
    setIsConfirmationOpen(false);
    setIsSending(true);
    setGlobalError(null);

    const campaignId = activeCampaignId || `camp_${Date.now()}`;
    setActiveCampaignId(campaignId);

    // Batch into chunks of 15 recipients for reliable serverless execution
    const BATCH_SIZE = 15;
    const total = recipientsToSend.length;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const slice = recipientsToSend.slice(i, i + BATCH_SIZE);

      const items: SendRecipientItem[] = slice.map((r) => ({
        recipientId: r.id,
        name: r.rawName,
        phone: r.normalizedPhone,
        message: personalizeMessage(message, r.rawName),
      }));

      try {
        const response = await fetch('/api/send-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-access-key': accessKey,
          },
          body: JSON.stringify({
            campaignId,
            recipients: items,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error || `HTTP ${response.status} sending batch`;

          // Mark this slice as failed
          const failedBatchResults: RecipientSendResult[] = slice.map((r) => ({
            recipientId: r.id,
            name: r.rawName,
            phone: r.normalizedPhone,
            maskedPhone: r.maskedPhone,
            status: 'failed',
            error: errMsg,
            timestamp: new Date().toISOString(),
          }));

          setCampaignResults((prev) => {
            const map = new Map(prev.map((item) => [item.recipientId, item]));
            failedBatchResults.forEach((res) => map.set(res.recipientId, res));
            return Array.from(map.values());
          });

          if (response.status === 401) {
            setGlobalError('Authorization failed. Please enter the valid company access key.');
            setIsAccessModalOpen(true);
            break;
          }
          continue;
        }

        const data: { success: boolean; results: RecipientSendResult[] } = await response.json();

        setCampaignResults((prev) => {
          const map = new Map(prev.map((item) => [item.recipientId, item]));
          data.results.forEach((res) => map.set(res.recipientId, res));
          return Array.from(map.values());
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Network error during batch';
        const errorBatchResults: RecipientSendResult[] = slice.map((r) => ({
          recipientId: r.id,
          name: r.rawName,
          phone: r.normalizedPhone,
          maskedPhone: r.maskedPhone,
          status: 'timeout_unconfirmed',
          error: `Network dispatch failed: ${msg}`,
          timestamp: new Date().toISOString(),
        }));

        setCampaignResults((prev) => {
          const map = new Map(prev.map((item) => [item.recipientId, item]));
          errorBatchResults.forEach((res) => map.set(res.recipientId, res));
          return Array.from(map.values());
        });
      }
    }

    setIsSending(false);
  };

  // Full Send Handler
  const handleStartCampaign = () => {
    executeBatchSend(selectedRecipients);
  };

  // Safe Retry Handler (only retries failed items)
  const handleRetryFailed = () => {
    const failedIds = new Set(
      campaignResults
        .filter((r) => r.status === 'failed' || r.status === 'timeout_unconfirmed')
        .map((r) => r.recipientId)
    );

    const retryRecipients = recipients.filter((r) => failedIds.has(r.id));
    if (retryRecipients.length > 0) {
      executeBatchSend(retryRecipients);
    }
  };

  // Start New Campaign
  const handleStartNewCampaign = () => {
    setParseResult(null);
    setUploadedFile(null);
    setRecipients([]);
    setCurrentMapping(null);
    setCampaignResults([]);
    setActiveCampaignId(null);
    setGlobalError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
      {/* Header */}
      <Header
        accessKey={accessKey}
        onOpenAccessModal={() => setIsAccessModalOpen(true)}
        authRequired={authRequired}
        providerConfigured={providerConfigured}
        senderName={senderName}
        balance={balance}
      />

      {/* Main Container */}
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 space-y-8">
        {/* Global Error Banner */}
        {globalError && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-xs text-rose-800 shadow-xs flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-900">Operation Error</p>
              <p className="mt-0.5 text-rose-800">{globalError}</p>
            </div>
          </div>
        )}

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

        {/* Step 4: Campaign Action Bar */}
        {recipients.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Ready to Dispatch Campaign
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Sending to{' '}
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
                Review & Send Campaign
              </button>
            </div>
          </section>
        )}

        {/* Step 5: Sending Progress & Results */}
        {(campaignResults.length > 0 || isSending) && (
          <SendingProgressSection
            results={campaignResults}
            totalExpected={selectedRecipients.length}
            isSending={isSending}
            onRetryFailed={handleRetryFailed}
            onStartNewCampaign={handleStartNewCampaign}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-6xl px-4">
          Yonas Mobile SMS Sender • Internal Company Tool • AfroMessage API Integration
        </div>
      </footer>

      {/* Confirmation Modal */}
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

      {/* Access Key Modal */}
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
