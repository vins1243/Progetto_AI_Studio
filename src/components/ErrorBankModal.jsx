import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, Trash2, Sparkles, Eye, EyeOff } from 'lucide-react';

export default function ErrorBankModal({
  isOpen,
  onClose,
  theme = 'dark',
  errorBank = [],
  onResolveError,
  onClearAll,
  onTurnIntoFlashcards,
}) {
  const [revealedIds, setRevealedIds] = useState(() => new Set());

  if (!isOpen) return null;

  const toggleReveal = (id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div
        className={`w-full max-w-2xl max-h-[86vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
          theme === 'light'
            ? 'bg-white border-rose-200 text-slate-900'
            : 'bg-[#1c1018] border-[#3e2133] text-gray-100'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-200/80 dark:border-[#3e2133] flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-500 flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">Banca degli Errori ({errorBank.length})</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Ripassa solo le domande in cui hai sbagliato prima dell&apos;esame</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#2b1824] transition">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {errorBank.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
              <div className="font-extrabold text-sm">Nessun errore in sospeso!</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Ogni volta che sbagli una domanda nei Vero/Falso o nei Quiz, MinervaAI la salva automaticamente qui per fartela recuperare.
              </p>
            </div>
          ) : (
            errorBank.map((err) => {
              const isRevealed = revealedIds.has(err.id);
              return (
                <div
                  key={err.id}
                  className={`p-4 rounded-2xl border space-y-2.5 ${
                    theme === 'light'
                      ? 'bg-rose-50/40 border-rose-200/80'
                      : 'bg-[#120a10] border-[#3e2133]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-300">
                        {err.topicTitle || 'Ripasso'}
                      </span>
                      <p className="text-xs sm:text-sm font-bold leading-snug">{err.question}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onResolveError?.(err.id)}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1 shrink-0 transition"
                      title="Segna come imparato"
                    >
                      <CheckCircle2 size={13} /> Imparato
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleReveal(err.id)}
                    className="text-[11px] font-bold text-indigo-500 hover:underline flex items-center gap-1"
                  >
                    {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                    <span>{isRevealed ? 'Nascondi risposta' : 'Mostra risposta corretta e spiegazione'}</span>
                  </button>

                  {isRevealed && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1">
                      <div className="font-extrabold text-emerald-700 dark:text-emerald-300">
                        Risposta corretta: {err.correctAnswer}
                      </div>
                      {err.explanation && <p className="opacity-90">{err.explanation}</p>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {errorBank.length > 0 && (
          <div className="px-5 py-3.5 border-t border-slate-200/80 dark:border-[#3e2133] flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClearAll}
              className="px-3 py-2 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 flex items-center gap-1.5 transition"
            >
              <Trash2 size={13} /> Svuota banca
            </button>
            {onTurnIntoFlashcards && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onTurnIntoFlashcards();
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition"
              >
                <Sparkles size={13} /> Trasforma in Flashcard SRS
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
