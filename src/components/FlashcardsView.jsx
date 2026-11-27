import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  RotateCw,
  RefreshCw,
  Download,
  Trash2,
  CheckCircle2,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { streamAiApi, QuotaExceededError } from '../utils/apiClient.js';
import { exportAnkiDeck } from '../utils/exportUtils.js';

export default function FlashcardsView({
  theme = 'dark',
  activeProject,
  topicTitle = '',
  lessonContent = '',
  cards = [],
  errorBank = [],
  onSaveCards,
  onQuotaExceeded,
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [filterMode, setFilterMode] = useState('due'); // 'due' | 'all'

  const topicCards = useMemo(() => {
    if (!topicTitle) return cards || [];
    const norm = topicTitle.trim().toLowerCase();
    const matching = (cards || []).filter(
      (c) => !c.topicTitle || c.topicTitle.trim().toLowerCase() === norm
    );
    return matching.length > 0 ? matching : cards || [];
  }, [cards, topicTitle]);

  const deck = useMemo(() => {
    const now = Date.now();
    if (filterMode === 'all') return topicCards;
    const due = topicCards.filter((c) => !c.dueAt || new Date(c.dueAt).getTime() <= now);
    return due.length > 0 ? due : topicCards;
  }, [topicCards, filterMode]);

  const currentCard = deck[currentIndex % Math.max(1, deck.length)] || null;

  const dueCount = useMemo(() => {
    const now = Date.now();
    return topicCards.filter((c) => !c.dueAt || new Date(c.dueAt).getTime() <= now).length;
  }, [topicCards]);

  const handleGenerate = async (fromErrorsOnly = false) => {
    setErrorMsg('');
    setIsGenerating(true);
    try {
      const data = await streamAiApi({
        action: 'generate_flashcards',
        topicTitle: fromErrorsOnly ? `Ripasso Errori — ${activeProject?.description || ''}` : topicTitle || activeProject?.description || 'Ripasso',
        examDescription: activeProject?.description || '',
        lessonContent: fromErrorsOnly ? '' : lessonContent || '',
        errorItems: fromErrorsOnly ? errorBank : [],
      });
      if (Array.isArray(data?.cards) && data.cards.length > 0) {
        const merged = [...data.cards, ...(cards || [])];
        onSaveCards?.(merged);
        setCurrentIndex(0);
        setIsFlipped(false);
        setFilterMode('due');
      }
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        onQuotaExceeded?.(err.message);
      } else {
        setErrorMsg(err.message || 'Errore nella generazione delle flashcard.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Algoritmo Spaced Repetition (SM-2 semplificato)
  const handleRateCard = (quality) => {
    if (!currentCard) return;
    let nextInterval = 0;
    let nextEase = currentCard.ease || 2.5;
    let nextReps = (currentCard.reps || 0) + 1;

    if (quality === 'again') {
      nextInterval = 0; // Ripeti subito in questa sessione
      nextReps = 0;
      nextEase = Math.max(1.3, nextEase - 0.2);
    } else if (quality === 'hard') {
      nextInterval = 1;
      nextEase = Math.max(1.5, nextEase - 0.1);
    } else if (quality === 'good') {
      nextInterval = nextReps <= 1 ? 3 : Math.round((currentCard.intervalDays || 2) * nextEase);
    } else if (quality === 'easy') {
      nextInterval = nextReps <= 1 ? 7 : Math.round((currentCard.intervalDays || 3) * nextEase * 1.3);
      nextEase = Math.min(3.0, nextEase + 0.15);
    }

    const dueAt = new Date(Date.now() + nextInterval * 86400000).toISOString();
    const updatedAll = (cards || []).map((c) =>
      c.id === currentCard.id
        ? { ...c, intervalDays: nextInterval, ease: nextEase, reps: nextReps, dueAt }
        : c
    );
    onSaveCards?.(updatedAll);
    setIsFlipped(false);
    setCurrentIndex((i) => (deck.length > 1 ? (i + 1) % deck.length : 0));
  };

  const handleDeleteCard = (id) => {
    const updatedAll = (cards || []).filter((c) => c.id !== id);
    onSaveCards?.(updatedAll);
    setIsFlipped(false);
    setCurrentIndex(0);
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* TOP BAR */}
      <div className="p-4 rounded-3xl border border-indigo-500/20 bg-white dark:bg-[#1c1018] shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white flex items-center justify-center shadow-md">
            <Layers size={18} />
          </div>
          <div>
            <div className="font-extrabold text-sm">Flashcard SRS (Ripetizione Dilazionata)</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {topicCards.length} carte nel mazzo • <span className="text-indigo-500 font-bold">{dueCount} da ripassare oggi</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleGenerate(false)}
            disabled={isGenerating}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition"
          >
            {isGenerating ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
            <span>{isGenerating ? 'Generazione...' : 'Genera Flashcard AI'}</span>
          </button>

          {errorBank.length > 0 && (
            <button
              type="button"
              onClick={() => handleGenerate(true)}
              disabled={isGenerating}
              className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <AlertCircle size={13} />
              <span>Da Errori ({errorBank.length})</span>
            </button>
          )}

          {topicCards.length > 0 && (
            <button
              type="button"
              onClick={() => exportAnkiDeck(topicCards, topicTitle || activeProject?.description)}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#2b1824] hover:bg-indigo-500/15 text-xs font-bold flex items-center gap-1.5 transition"
              title="Scarica mazzo pronto da importare in Anki"
            >
              <Download size={13} />
              <span>Anki (.txt)</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* CARTA INTERATTIVA */}
      {currentCard ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs px-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setFilterMode('due'); setCurrentIndex(0); setIsFlipped(false); }}
                className={`px-3 py-1 rounded-full font-bold transition ${
                  filterMode === 'due' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-[#2b1824] text-slate-500'
                }`}
              >
                Da ripassare ({dueCount})
              </button>
              <button
                type="button"
                onClick={() => { setFilterMode('all'); setCurrentIndex(0); setIsFlipped(false); }}
                className={`px-3 py-1 rounded-full font-bold transition ${
                  filterMode === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-[#2b1824] text-slate-500'
                }`}
              >
                Tutte ({topicCards.length})
              </button>
            </div>
            <span className="font-mono font-bold text-slate-500">
              Carta {(currentIndex % deck.length) + 1} / {deck.length}
            </span>
          </div>

          <div
            onClick={() => setIsFlipped((f) => !f)}
            className={`min-h-[260px] p-6 sm:p-8 rounded-3xl border-2 cursor-pointer transition-all shadow-xl flex flex-col justify-between select-none ${
              isFlipped
                ? theme === 'light'
                  ? 'bg-emerald-50/70 border-emerald-400 text-slate-900'
                  : 'bg-[#13221a] border-emerald-500/60 text-emerald-50'
                : theme === 'light'
                  ? 'bg-white border-rose-200 hover:border-indigo-400 text-slate-900'
                  : 'bg-[#1c1018] border-[#3e2133] hover:border-indigo-500/60 text-gray-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                {isFlipped ? 'RISPOSTA' : currentCard.tag || 'DOMANDA'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteCard(currentCard.id);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 transition"
                title="Elimina questa flashcard"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="my-6 text-center px-2">
              <p className={`font-bold leading-relaxed ${isFlipped ? 'text-base sm:text-lg font-medium' : 'text-lg sm:text-xl'}`}>
                {isFlipped ? currentCard.back : currentCard.front}
              </p>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-semibold">
              <RotateCw size={12} />
              <span>{isFlipped ? 'Valuta quanto la ricordavi qui sotto' : 'Clicca la carta per girare e vedere la risposta'}</span>
            </div>
          </div>

          {/* PULSANTI SRS (ANKI-STYLE) */}
          {isFlipped && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => handleRateCard('again')}
                className="py-3 px-3 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-600 dark:text-rose-300 font-extrabold text-xs transition"
              >
                Non la so
                <div className="text-[10px] font-normal opacity-80 mt-0.5">Ripeti subito</div>
              </button>
              <button
                type="button"
                onClick={() => handleRateCard('hard')}
                className="py-3 px-3 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-600 dark:text-amber-300 font-extrabold text-xs transition"
              >
                Difficile
                <div className="text-[10px] font-normal opacity-80 mt-0.5">Tra 1 giorno</div>
              </button>
              <button
                type="button"
                onClick={() => handleRateCard('good')}
                className="py-3 px-3 rounded-2xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 text-indigo-600 dark:text-indigo-300 font-extrabold text-xs transition"
              >
                Bene
                <div className="text-[10px] font-normal opacity-80 mt-0.5">Tra 3 giorni</div>
              </button>
              <button
                type="button"
                onClick={() => handleRateCard('easy')}
                className="py-3 px-3 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-600 dark:text-emerald-300 font-extrabold text-xs transition"
              >
                Facile
                <div className="text-[10px] font-normal opacity-80 mt-0.5">Tra 7 giorni</div>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-10 rounded-3xl border-2 border-dashed border-indigo-400/30 bg-white/70 dark:bg-[#1c1018]/60 text-center space-y-3">
          <CheckCircle2 size={32} className="mx-auto text-indigo-500 opacity-80" />
          <h3 className="font-extrabold text-base">Crea il tuo mazzo di Flashcard Active Recall</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Genera in 1 clic 12–16 carte mirate su definizioni, cut-off e meccanismi d&apos;esame. Il sistema ti ripropone automaticamente le carte più difficili e puoi esportarle su Anki.
          </p>
          <button
            type="button"
            onClick={() => handleGenerate(false)}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg transition"
          >
            {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>{isGenerating ? 'Creazione in corso...' : 'Genera Flashcard da questa Lezione'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
