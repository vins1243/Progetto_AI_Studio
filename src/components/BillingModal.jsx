import React, { useState } from 'react';
import { X, Zap, Check, CreditCard, ShieldCheck, RefreshCw } from 'lucide-react';
import { startStripeCheckout, openStripePortal } from '../utils/apiClient.js';

export default function BillingModal({
  isOpen,
  onClose,
  isPro,
  usageInfo,
  reasonMessage = '',
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const usage = usageInfo?.usage || { lessons: 0, chat: 0, maps: 0, quizzes: 0 };
  const limits = usageInfo?.limits || (isPro
    ? { lessons: 120, chat: 600, maps: 100, quizzes: 100 }
    : { lessons: 3, chat: 10, maps: 2, quizzes: 2 });

  const handleCheckout = async () => {
    setError('');
    setLoading(true);
    try {
      await startStripeCheckout();
    } catch (err) {
      setError(err.message || 'Errore avvio pagamento Stripe.');
      setLoading(false);
    }
  };

  const handlePortal = async () => {
    setError('');
    setLoading(true);
    try {
      await openStripePortal();
    } catch (err) {
      setError(err.message || 'Errore apertura portale Stripe.');
      setLoading(false);
    }
  };

  const bars = [
    { label: 'Lezioni / Compendi AI', used: usage.lessons, max: limits.lessons },
    { label: 'Mappe Concettuali', used: usage.maps, max: limits.maps },
    { label: 'Quiz e Valutazioni', used: usage.quizzes, max: limits.quizzes },
    { label: 'Messaggi Tutor Chat', used: usage.chat, max: limits.chat },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-[#2a2b2f] bg-white dark:bg-[#1e1f20] p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-500">
              <Zap size={12} /> {isPro ? 'Piano MinervaAI Pro Attivo' : 'Piano Free'}
            </span>
            <h3 className="text-xl font-bold mt-2">
              {isPro ? 'Gestione Abbonamento e Utilizzo' : 'Passa a MinervaAI Pro'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#282a2c] transition"
          >
            <X size={18} />
          </button>
        </div>

        {reasonMessage && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs font-medium">
            {reasonMessage}
          </div>
        )}

        {/* BARRE UTILIZZO MENSILE */}
        <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-[#131314] border border-slate-200/70 dark:border-[#2a2b2f]">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">
            Utilizzo mensile corrente
          </div>
          {bars.map((b) => {
            const pct = Math.min(100, Math.round(((b.used || 0) / Math.max(1, b.max)) * 100));
            return (
              <div key={b.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{b.label}</span>
                  <span className="font-mono text-slate-500 dark:text-gray-400">
                    {b.used} / {b.max}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-[#2a2b2f] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {!isPro && (
          <div className="space-y-2 text-xs text-slate-600 dark:text-gray-300">
            <div className="font-bold text-sm text-slate-900 dark:text-gray-100">
              Con Pro (14,99 €/mese) sblocchi:
            </div>
            {[
              'Fino a 120 compendi approfonditi al mese con Gemini Pro',
              'Fino a 100 mappe concettuali interattive e 100 verifiche AI',
              'Fino a 600 messaggi Tutor Chat e 50 progetti simultanei',
              'Disdetta autonoma in 1 clic dal portale Stripe',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <Check size={14} className="text-emerald-500 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2.5 pt-1">
          {!isPro ? (
            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-sm shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition"
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <CreditCard size={16} />}
              {loading ? 'Reindirizzamento a Stripe...' : 'Attiva MinervaAI Pro · 14,99 €/mese'}
            </button>
          ) : (
            <button
              onClick={handlePortal}
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-sm flex items-center justify-center gap-2 transition"
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <CreditCard size={16} />}
              {loading ? 'Apertura portale Stripe...' : 'Gestisci Abbonamento e Fatture (Stripe)'}
            </button>
          )}
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-gray-400">
            <ShieldCheck size={13} className="text-emerald-500" />
            <span>Pagamento crittografato e gestito da Stripe</span>
          </div>
        </div>
      </div>
    </div>
  );
}
