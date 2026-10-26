'use client';

import React from 'react';
import { Key, AlertTriangle, Coins, MessageSquare } from 'lucide-react';

interface HeaderProps {
  accessKey: string;
  onOpenAccessModal: () => void;
  authRequired: boolean;
  providerConfigured: boolean;
  senderName: string;
  balance: { balance: string; estimatedMessages: string } | null;
}

export function Header({
  accessKey,
  onOpenAccessModal,
  authRequired,
  providerConfigured,
  senderName,
  balance,
}: HeaderProps) {
  const isAuthorized = !authRequired || (accessKey && accessKey.trim().length > 0);

  return (
    <header className="border-b border-slate-200 bg-white shadow-xs">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-white shadow-xs">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Yonas Mobile SMS Sender
              </h1>
              <p className="text-xs text-slate-500 sm:text-sm">
                Send personalized SMS messages to your customers.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Sender Name Badge */}
          <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
            <span className="text-slate-400">Sender:</span>
            <span className="font-semibold text-slate-900">{senderName}</span>
          </div>

          {/* Balance Badge if configured */}
          {balance && (
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
              <Coins className="h-3.5 w-3.5 text-emerald-600" />
              <span>Balance:</span>
              <span className="font-semibold">{balance.balance} ETB</span>
              <span className="text-emerald-600">({balance.estimatedMessages} msgs)</span>
            </div>
          )}

          {/* Provider status */}
          {providerConfigured ? (
            <div className="flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
              <span>AfroMessage Ready</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span>Provider Key Not Set</span>
            </div>
          )}

          {/* Access Key Indicator / Modal Trigger */}
          <button
            type="button"
            onClick={onOpenAccessModal}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium transition-colors ${
              isAuthorized
                ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                : 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
            title="Click to manage company access key"
          >
            <Key className="h-3.5 w-3.5 text-slate-400" />
            <span>{isAuthorized ? 'Access Key Set' : 'Access Key Required'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
