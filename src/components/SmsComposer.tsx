'use client';

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  Sparkles,
  Info,
  UserCheck,
} from 'lucide-react';
import {
  analyzeSmsMessage,
  findUnresolvedPlaceholders,
  estimateCampaignSegments,
} from '@/lib/sms';
import { RecipientRecord } from '@/types';

interface SmsComposerProps {
  message: string;
  onChangeMessage: (msg: string) => void;
  selectedRecipients: RecipientRecord[];
}

export function SmsComposer({
  message,
  onChangeMessage,
  selectedRecipients,
}: SmsComposerProps) {
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

        {/* Quick insertion toolbar */}
        <div className="flex items-center gap-2">
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
            Load Sample Template
          </button>
        </div>
      </div>

      {/* Message Textarea */}
      <div className="mt-4">
        <textarea
          rows={4}
          value={message}
          onChange={(e) => onChangeMessage(e.target.value)}
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
              {analysis.segmentCount} {analysis.segmentCount === 1 ? 'segment' : 'segments'}
            </span>
          </div>

          <div>
            Remaining in segment:{' '}
            <span className="font-semibold text-slate-900">
              {analysis.charsRemainingInSegment}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          {analysis.encoding === 'GSM-7'
            ? 'GSM 7-bit (160 / 153 chars per segment)'
            : 'UCS-2 Unicode (70 / 67 chars per segment)'}
        </div>
      </div>

      {/* Unresolved Placeholders Warning */}
      {unresolvedPlaceholders.length > 0 && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <div>
            <p className="font-semibold">Unresolved Placeholders Detected</p>
            <p className="mt-0.5">
              The following placeholder(s) are not supported:{' '}
              <span className="font-mono font-bold">{unresolvedPlaceholders.join(', ')}</span>.
              Only <span className="font-mono font-bold">{'{{name}}'}</span> is supported.
              Sending will be blocked until these are corrected.
            </p>
          </div>
        </div>
      )}

      {/* Multi-segment alert banner */}
      {analysis.segmentCount > 1 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="font-semibold">Multi-Segment Message Warning</p>
            <p className="mt-0.5">
              This message exceeds a single SMS segment and will be billed as{' '}
              <span className="font-bold">{analysis.segmentCount} segments</span> per recipient by telecom carriers.
            </p>
          </div>
        </div>
      )}

      {/* Live Personalized Previews */}
      {message.length > 0 && selectedRecipients.length > 0 && (
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
            <UserCheck className="h-4 w-4 text-blue-600" />
            Live Customer Previews (First {campaignEstimate.samplePersonalized.length} Selected Recipients)
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {campaignEstimate.samplePersonalized.map((sample, idx) => (
              <div
                key={idx}
                className="rounded-md border border-slate-200 bg-white p-3 shadow-2xs"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500 pb-1.5 border-b border-slate-100">
                  <span className="font-medium text-slate-800">
                    To: {sample.name || 'Customer'}
                  </span>
                  <span className="text-slate-400">
                    {sample.segments} {sample.segments === 1 ? 'segment' : 'segments'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {sample.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
