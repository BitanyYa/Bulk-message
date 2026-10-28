'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Key,
  AlertTriangle,
  Coins,
  MessageSquare,
  LayoutDashboard,
  History,
  PlusCircle,
  FileText,
} from 'lucide-react';

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
  const pathname = usePathname();
  const isAuthorized = !authRequired || (accessKey && accessKey.trim().length > 0);

  const isDashboard = pathname === '/';
  const isHistory = pathname.startsWith('/campaigns') && pathname !== '/campaigns/new';
  const isNewCampaign = pathname === '/campaigns/new';
  const isTemplates = pathname.startsWith('/templates');

  return (
    <header className="border-b border-slate-200 bg-white shadow-xs sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-6">
          {/* Logo & Title */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-white shadow-xs group-hover:bg-blue-800 transition-colors">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-slate-900 group-hover:text-blue-700 transition-colors">
                Yonas Mobile SMS
              </div>
              <div className="text-[11px] text-slate-500 hidden sm:block">
                Campaign Manager & Sender
              </div>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1 pl-2 sm:border-l sm:border-slate-200">
            <Link
              href="/"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                isDashboard
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>Dashboard</span>
            </Link>

            <Link
              href="/campaigns"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                isHistory
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Campaign History</span>
            </Link>

            <Link
              href="/templates"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                isTemplates
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Templates</span>
            </Link>
          </nav>
        </div>

        {/* Action Button & Badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Prominent New Campaign Button */}
          <Link
            href="/campaigns/new"
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-xs transition-colors ${
              isNewCampaign
                ? 'bg-blue-800 text-white ring-2 ring-blue-400 ring-offset-1'
                : 'bg-blue-700 text-white hover:bg-blue-800'
            }`}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>New Campaign</span>
          </Link>

          {/* Sender Name Badge */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
            <span className="text-slate-400">Sender:</span>
            <span className="font-semibold text-slate-900">{senderName}</span>
          </div>

          {/* Balance Badge if configured */}
          {balance && (
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
              <Coins className="h-3.5 w-3.5 text-emerald-600" />
              <span>Balance:</span>
              <span className="font-semibold">{balance.balance} ETB</span>
            </div>
          )}

          {/* Provider status */}
          {providerConfigured ? (
            <div className="hidden md:flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
              <span>AfroMessage Ready</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
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
                : 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 animate-pulse'
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
