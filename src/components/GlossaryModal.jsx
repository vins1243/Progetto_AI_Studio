import React, { useState, useMemo } from 'react';
import { X, BookMarked, Search, Sparkles, RefreshCw, Download } from 'lucide-react';
import { streamAiApi, QuotaExceededError } from '../utils/apiClient.js';

export default function GlossaryModal({
  isOpen,
  onClose,
  theme = 'dark',
  activeProject,
  entries = [],
  onSaveEntries,
  onQuotaExceeded,
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tutte');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const categories = ['Tutte', 'Definizione', 'Formula', 'Classificazione', 'Valore/Cut-off', 'Manovra/Test'];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (entries || []).filter((e) => {
      if (category !== 'Tutte' && e.category !== category) return false;
      if (!q) return true;
      return (
        String(e.term || '').toLowerCase().includes(q) ||
        String(e.definition || '').toLowerCase().includes(q) ||
        String(e.formulaOrValue || '').toLowerCase().includes(q)
      );
    });
  }, [entries, search, category]);

  const handleGenerate = async () => {
    setErrorMsg('');
    setIsGenerating(true);
    try {
      const combinedLessons = (activeProject?.schedule || [])
        .flatMap((d) => (d.topics || []).map((t) => (t.lesson ? `### ${t.title}\n${t.lesson}` : '')))
        .filter(Boolean)
        .join('\n\n');

      const data = await streamAiApi({
        action: 'generate_glossary',
        examDescription: activeProject?.description || 'Corso',
        lessonContent: combinedLessons,
        files: (activeProject?.files || []).map((f) => ({
          name: f.name,
          text: f.extractedText || f.text || '',
        })),
      });
      if (Array.isArray(data?.entries) && data.entries.length > 0) {
        onSaveEntries?.(data.entries);
      } else {
        setErrorMsg('Impossibile estrarre il glossario. Riprova.');
      }
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        onQuotaExceeded?.(err.message);
        onClose();
      } else {
        setErrorMsg(err.message || 'Errore generazione glossario.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrintGlossary = () => {
    if (!entries.length) return;
    const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = entries
      .map(
        (e) =>
          `<tr><td><strong>${esc(e.term)}</strong><br/><span style="font-size:8pt;color:#be123c;">${esc(e.category || '')}</span></td><td>${esc(e.definition)}${e.formulaOrValue ? `<div style="margin-top:4px;font-family:monospace;background:#fdf2f8;padding:3px 6px;border-radius:4px;">${esc(e.formulaOrValue)}</div>` : ''}</td></tr>`
      )
      .join('');
    const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/><title>Glossario & Formulario — ${esc(activeProject?.description)}</title>
    <style>@page{size:A4;margin:15mm}body{font-family:Inter,sans-serif;font-size:10pt;color:#1e293b}h1{color:#881337;border-bottom:2px solid #be123c;padding-bottom:6px}table{width:100%;border-collapse:collapse}th{background:#fdf2f8;color:#881337;text-align:left;padding:7px;border:1px solid #f3d5e0}td{padding:7px;border:1px solid #e2e8f0;vertical-align:top}</style></head>
    <body><h1>Glossario & Formulario — ${esc(activeProject?.description || 'Corso')}</h1><table><thead><tr><th style="width:30%">Termine</th><th>Definizione / Formula / Cut-off</th></tr></thead><tbody>${rows}</tbody></table>
    <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script></body></html>`;
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div
        className={`w-full max-w-3xl max-h-[88vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
          theme === 'light'
            ? 'bg-white border-rose-200 text-slate-900'
            : 'bg-[#1c1018] border-[#3e2133] text-gray-100'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-200/80 dark:border-[#3e2133] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/15 text-indigo-500 flex items-center justify-center">
              <BookMarked size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">Glossario & Formulario del Corso</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Tutte le definizioni, formule e cut-off in un unico bigino ricercabile</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {entries.length > 0 && (
              <button
                type="button"
                onClick={handlePrintGlossary}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#2b1824] hover:bg-indigo-500/15 text-xs font-bold flex items-center gap-1 transition"
              >
                <Download size={13} /> PDF
              </button>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition"
            >
              {isGenerating ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
              <span>{isGenerating ? 'Estrazione...' : entries.length ? 'Aggiorna AI' : 'Genera Glossario AI'}</span>
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#2b1824] transition">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-slate-200/60 dark:border-[#3e2133] space-y-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca termine, formula, cut-off..."
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-slate-100 dark:bg-[#120a10] border border-slate-200 dark:border-[#3e2133] outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition ${
                  category === cat
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-[#2b1824] text-slate-500 dark:text-slate-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <BookMarked size={32} className="mx-auto text-indigo-400 opacity-75" />
              <div className="font-bold text-sm">{entries.length === 0 ? 'Nessun glossario generato ancora' : 'Nessun risultato per questo filtro'}</div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Clicca su <strong>Genera Glossario AI</strong> per estrarre automaticamente tutte le definizioni, formule e soglie chiave del corso.
              </p>
            </div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-2xl border space-y-1 ${
                  theme === 'light' ? 'bg-rose-50/40 border-rose-200/70' : 'bg-[#120a10] border-[#3e2133]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-xs sm:text-sm">{item.term}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                    {item.category || 'Definizione'}
                  </span>
                </div>
                <p className="text-xs opacity-90 leading-relaxed">{item.definition}</p>
                {item.formulaOrValue && (
                  <div className="mt-1.5 inline-block px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/25 font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-300">
                    {item.formulaOrValue}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
