'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Sparkles,
  Info,
  UserCheck,
  FileText,
  ExternalLink,
} from 'lucide-react';
import {
  analyzeSmsMessage,
  findUnresolvedPlaceholders,
  estimateCampaignSegments,
} from '@/lib/sms';
import { RecipientRecord, MessageTemplateRecord } from '@/types';

interface SmsComposerProps {
  message: string;
  onChangeMessage: (msg: string) => void;
  selectedRecipients: RecipientRecord[];
  initialTemplates?: MessageTemplateRecord[];
}

export function SmsComposer({
  message,
  onChangeMessage,
  selectedRecipients,
  initialTemplates,
}: SmsComposerProps) {
  const [templates, setTemplates] = useState<MessageTemplateRecord[]>(initialTemplates || []);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  useEffect(() => {
    let active = true;
    async function loadActiveTemplates() {
      try {
        const accessKey = typeof window !== 'undefined' ? sessionStorage.getItem('yonas_sms_access_key') : null;
        const headers: Record<string, string> = {};
        if (accessKey) {
          headers['x-app-access-key'] = accessKey;
        }
        const res = await fetch('/api/templates?status=active&pageSize=50', { headers });
        if (res.ok && active) {
          const data = await res.json();
          setTemplates(data.templates || []);
        }
      } catch {
        // quiet fallback
      }
    }

    if (!initialTemplates || initialTemplates.length === 0) {
      loadActiveTemplates();
    }

    return () => {
      active = false;
    };
  }, [initialTemplates]);

  const analysis = useMemo(() => {
    return analyzeSmsMessage(message);
  }, [message]);

  const unresolvedPlaceholders = useMemo(() => {
    return findUnresolvedPlaceholders(message);
  }, [message]);

  const sampleNames = useMemo(() => {
    return selectedRecipients.slice(0, 5).map((r) => r.rawName || 'Customer');
  }, [selectedRecipients]);

  const campaignEstimate = useMemo(() => {
    return estimateCampaignSegments(message, sampleNames);
  }, [message, sampleNames]);

  const insertPlaceholder = () => {
    const placeholder = '{{name}}';
    onChangeMessage(`${message}${message.endsWith(' ') || message.length === 0 ? '' : ' '}${placeholder}`);
  };

  const applyDefaultTemplate = () => {
    onChangeMessage('Hello {{name}}, thank you for choosing Yonas Mobile! We appreciate your trust in us.');
    setSelectedTemplateId('');
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const found = templates.find((t) => t.id === templateId);
    if (found) {
      onChangeMessage(found.body);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">
              3
            </span>
            <h2 className="text-base font-semibold text-slate-900">SMS Composer</h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Compose your campaign message. Use <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-700 font-mono text-[11px] font-semibold">{'{{name}}'}</code> to personalize each SMS.
          </p>
        </div>

        {/* Quick insertion & template toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Template dropdown */}
          {templates.length > 0 && (
            <div className="relative">
              <select
                value={selectedTemplateId}
                onChange={(e) => handleSelectTemplate(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs focus:border-blue-600 focus:outline-hidden"
              >
                <option value="">Select Saved Template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={insertPlaceholder}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <Sparkles className="h-3 w-3 text-blue-600" />
            + Insert {'{{name}}'}
          </button>

          <button
            type="button"
            onClick={applyDefaultTemplate}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Sample
          </button>

          <Link
            href="/templates"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 ml-1"
            title="Open Templates manager"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Templates</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        </div>
      </div>

      {/* Message Textarea */}
      <div className="mt-4">
        <textarea
          rows={4}
          value={message}
          onChange={(e) => {
            onChangeMessage(e.target.value);
            setSelectedTemplateId('');
          }}
          placeholder="Hello {{name}}, thank you for choosing Yonas Mobile! We appreciate your trust in us."
          className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 transition-all font-sans"
        />
      </div>

      {/* Real-time stats bar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-4 text-slate-600">
          <div>
            Characters: <span className="font-semibold text-slate-900">{analysis.charCount}</span>
          </div>

          <div>
            Encoding:{' '}
            <span
              className={`font-semibold rounded px-1.5 py-0.5 ${
                analysis.hasUnicode
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {analysis.encoding}
            </span>
          </div>

          <div>
            Segments:{' '}
            <span
              className={`font-semibold ${
                analysis.segmentCount > 1 ? 'text-amber-700 font-bold' : 'text-slate-900'
              }`}
            >
              {analysis.segmentCount} {analysis.segmentCount === 1 ? 'SMS Segment' : 'SMS Segments'}
            </span>
          </div>

          <div className="text-slate-400">
            ({analysis.charsRemainingInSegment} chars left in current segment)
          </div>
        </div>

        {campaignEstimate.maxSegmentsPerMessage > 1 && (
          <div className="text-amber-700 font-medium">
            Long names may cause up to {campaignEstimate.maxSegmentsPerMessage} segments.
          </div>
        )}
      </div>

      {/* Unresolved Placeholders Warning */}
      {unresolvedPlaceholders.length > 0 && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <div>
            <span className="font-semibold">Unresolved placeholder(s): </span>
            {unresolvedPlaceholders.join(', ')}. Only <code className="font-mono bg-white px-1 py-0.5 rounded">{'{{name}}'}</code> is supported. Other tags will be sent as plain text.
          </div>
        </div>
      )}

      {/* Unicode / Multi-segment Notice */}
      {analysis.hasUnicode && (
        <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 text-purple-600 mt-0.5" />
          <div>
            <span className="font-semibold">Unicode message detected: </span>
            Using UCS-2 encoding. Each SMS segment is limited to 70 characters (instead of 160 GSM-7 characters).
          </div>
        </div>
      )}

      {/* Personalized Live Preview Cards */}
      {sampleNames.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
            <UserCheck className="h-4 w-4 text-blue-700" />
            <span>Personalized Preview for Sample Customers ({sampleNames.length} shown)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {campaignEstimate.samplePersonalized.map((sample, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs shadow-2xs"
              >
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="font-bold text-slate-900">{sample.name}</span>
                  <span className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px]">
                    {sample.segments} {sample.segments === 1 ? 'segment' : 'segments'}
                  </span>
                </div>
                <div className="text-slate-800 font-mono text-[11px] bg-white rounded p-2 border border-slate-100 whitespace-pre-wrap">
                  {sample.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
