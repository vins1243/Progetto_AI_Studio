import React from 'react';
import { Sparkles, ArrowRight, BookOpen } from 'lucide-react';

export default function PublicShareView({
  sharedItem,
  renderMarkdownAndLatexToHtml,
  onTryMinerva,
}) {
  if (!sharedItem) return null;

  const isLesson = sharedItem.item_type === 'lesson';
  const html = isLesson
    ? renderMarkdownAndLatexToHtml(sharedItem.payload?.lesson || '', sharedItem.payload?.imagesMap || {})
    : '';

  return (
    <div className="min-h-screen bg-[#fdf7f9] text-slate-900 flex flex-col">
      {/* BANNER VIRALE IN ALTO */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-rose-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-600 to-fuchsia-700 text-white flex items-center justify-center shadow-sm">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="font-extrabold text-sm text-rose-900">MinervaAI</div>
            <div className="text-[11px] text-slate-500">Contenuto condiviso in sola lettura</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onTryMinerva}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-fuchsia-700 hover:from-rose-500 hover:to-fuchsia-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition"
        >
          <span>Crea la tua guida gratis</span>
          <ArrowRight size={13} />
        </button>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="border-b-2 border-rose-600 pb-4 space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-rose-600">
            <BookOpen size={13} />
            <span>{sharedItem.subtitle || 'Compendio Didattico MinervaAI'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">{sharedItem.title}</h1>
        </div>

        {isLesson ? (
          <article
            className="wysiwyg-editor bg-white p-6 sm:p-8 rounded-3xl border border-rose-200/80 shadow-sm"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="bg-white p-6 rounded-3xl border border-rose-200/80 shadow-sm space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-rose-600">
              Mappa Concettuale ({(sharedItem.payload?.nodes || []).length} nodi)
            </div>
            <div className="space-y-2">
              {(sharedItem.payload?.nodes || []).map((n) => (
                <div
                  key={n.id}
                  style={{ marginLeft: `${Math.min(3, n.level || 0) * 18}px` }}
                  className="p-3 rounded-xl border border-rose-200/80 bg-rose-50/40 text-xs sm:text-sm"
                >
                  <span className="font-bold text-slate-900">{n.label}</span>
                  {n.summary && <p className="text-slate-600 text-xs mt-0.5">{n.summary}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-6 rounded-3xl bg-gradient-to-r from-rose-600 to-fuchsia-700 text-white text-center space-y-3 shadow-xl">
          <div className="text-lg font-extrabold">Ti sono utili questi appunti?</div>
          <p className="text-xs text-rose-100 max-w-md mx-auto">
            Carica i tuoi PDF o registra le lezioni in aula: MinervaAI genera piani d&apos;esame, compendi completi, mappe mentali, flashcard e simulazioni orali in pochi secondi.
          </p>
          <button
            type="button"
            onClick={onTryMinerva}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-rose-700 font-extrabold text-xs shadow-md hover:bg-rose-50 transition"
          >
            <span>Prova MinervaAI Gratis</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </main>
    </div>
  );
}
