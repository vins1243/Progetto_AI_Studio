import React, { useState } from 'react';
import { X, Zap, Check, CreditCard, ShieldCheck, RefreshCw, Crown } from 'lucide-react';
import { startStripeCheckout, openStripePortal } from '../utils/apiClient.js';

const PAID_PLANS = [
  {
    id: 'plus',
    name: 'Plus',
    price: '9,99 €',
    badge: 'Superiori / 1–2 esami',
    features: ['5 progetti attivi', '25 lezioni/mese', '25 mappe & 25 quiz', '150 chat AI/mese'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '17,99 €',
    badge: 'Più scelto',
    highlight: true,
    features: ['25 progetti attivi', '90 lezioni (Gemini Pro)', '80 mappe & 80 quiz', '500 chat AI/mese'],
  },
  {
    id: 'ultra',
    name: 'Ultra',
    price: '29,99 €',
    badge: 'Sessione intensiva',
    features: ['100 progetti attivi', '250 lezioni (Gemini Pro)', '250 mappe & 250 quiz', '1.500 chat AI/mese'],
  },
];

export default function BillingModal({
  isOpen,
  onClose,
  isPro,
  usageInfo,
  reasonMessage = '',
}) {
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const currentTier = (usageInfo?.tier || usageInfo?.planType || (isPro ? 'pro' : 'free')).toLowerCase();
  const usage = usageInfo?.usage || { lessons: 0, chat: 0, maps: 0, quizzes: 0 };
  const limits = usageInfo?.limits || { lessons: 2, chat: 10, maps: 2, quizzes: 1 };

  const handleCheckout = async (planId) => {
    setError('');
    setLoading(true);
    try {
      await startStripeCheckout(planId || selectedPlan);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl border border-geminiBorder bg-geminiDarkSecondary p-6 shadow-2xl space-y-5 my-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-400">
              <Crown size={12} /> Piano attuale: {currentTier.toUpperCase()}
            </span>
            <h3 className="text-xl font-extrabold mt-2">
              {isPro ? 'Gestione Abbonamento e Utilizzo' : 'Scegli il tuo piano MinervaAI'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-geminiHover transition"
          >
            <X size={18} />
          </button>
        </div>

        {reasonMessage && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-300 text-xs font-semibold">
            {reasonMessage}
          </div>
        )}

        {/* BARRE UTILIZZO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-geminiDark border border-geminiBorder">
          {bars.map((b) => {
            const pct = Math.min(100, Math.round(((b.used || 0) / Math.max(1, b.max)) * 100));
            return (
              <div key={b.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold">{b.label}</span>
                  <span className="font-mono text-gray-400">
                    {b.used} / {b.max}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-geminiDarkSecondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* SELETTORE 3 PIANI (PLUS / PRO / ULTRA) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PAID_PLANS.map((p) => {
            const isSelected = selectedPlan === p.id;
            const isCurrent = currentTier === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlan(p.id)}
                className={`text-left p-4 rounded-2xl border-2 transition flex flex-col justify-between space-y-3 relative ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-600/10 shadow-lg shadow-indigo-600/15'
                    : 'border-geminiBorder bg-geminiDark/60 hover:border-indigo-500/40'
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-2.5 right-3 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-[10px] font-extrabold uppercase">
                    Più scelto
                  </span>
                )}
                <div>
                  <div className="text-[11px] font-bold text-indigo-400">{p.badge}</div>
                  <div className="text-lg font-extrabold mt-0.5 flex items-center justify-between">
                    <span>{p.name}</span>
                    {isCurrent && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Attivo</span>}
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold">{p.price}</span>
                    <span className="text-[11px] text-gray-400">/mese</span>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-[11px] text-gray-300">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <Check size={12} className="text-emerald-400 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            onClick={() => handleCheckout(selectedPlan)}
            disabled={loading}
            className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-60 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
            {loading
              ? 'Reindirizzamento a Stripe...'
              : `Attiva Piano ${PAID_PLANS.find((p) => p.id === selectedPlan)?.name} · ${PAID_PLANS.find((p) => p.id === selectedPlan)?.price}/mese`}
          </button>

          {isPro && (
            <button
              onClick={handlePortal}
              disabled={loading}
              className="px-5 py-3.5 rounded-2xl border border-geminiBorder hover:bg-geminiHover font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <CreditCard size={15} />
              <span>Portale Stripe</span>
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
          <ShieldCheck size={13} className="text-emerald-500" />
          <span>Pagamenti sicuri Stripe · Disdetta autonoma in 1 clic</span>
        </div>
      </div>
    </div>
  );
}
