'use client';

import React, { useState } from 'react';
import { Key, X, ShieldCheck } from 'lucide-react';

interface AccessKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKey: string;
  onSaveKey: (key: string) => void;
  authRequired: boolean;
}

export function AccessKeyModal({
  isOpen,
  onClose,
  currentKey,
  onSaveKey,
  authRequired,
}: AccessKeyModalProps) {
  const [keyInput, setKeyInput] = useState(currentKey);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveKey(keyInput.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Key className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Company Access Key</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            {authRequired
              ? 'This internal tool requires an authorization key to prevent unauthorized sending of SMS campaigns and safeguard company SMS credits.'
              : 'Authorization is currently optional in this development environment, but you can enter the APP_ACCESS_KEY configured in your .env file.'}
          </p>

          <div>
            <label htmlFor="accessKey" className="block text-xs font-medium text-slate-700">
              Access Secret / Key
            </label>
            <input
              id="accessKey"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Enter internal company access key"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-xs focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600"
              autoFocus
            />
          </div>

          <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-800 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
            <span>
              The access key is sent strictly via HTTPS header to the server and is never stored in public databases.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-700 px-4 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-blue-800"
            >
              Save Key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
