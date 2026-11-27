import React, { useState } from 'react';
import {
  Sparkles,
  Network,
  BookOpen,
  GraduationCap,
  Calendar,
  Mic,
  Check,
  ArrowRight,
  Sun,
  Moon,
  ChevronDown,
  ShieldCheck,
  Zap,
  FileText,
  Volume2,
} from 'lucide-react';
import logoImg from '../logo.png';

const FAQ_ITEMS = [
  {
    q: 'MinervaAI funziona sia per le scuole superiori che per l’università?',
    a: 'Sì! L’AI adatta automaticamente livello di approfondimento, linguaggio, tabelle, formule LaTeX e mappe concettuali alla materia e al grado di preparazione scelto (dalle verifiche delle superiori agli esami universitari più complessi).',
  },
  {
    q: 'Cosa posso fare gratis con il piano Free?',
    a: 'Puoi creare 1 progetto di studio completo con i tuoi PDF/Word/PowerPoint, generare fino a 3 compendi approfonditi, 2 mappe concettuali interattive, 2 verifiche/quiz e 10 messaggi di chat AI ogni mese, senza inserire carta di credito.',
  },
  {
    q: 'In cosa è più completo rispetto ad Algor Education?',
    a: 'Oltre alle mappe concettuali interattive modificabili con modalità Ripasso Attivo e lettura vocale (TTS), MinervaAI integra un pianificatore d’esame giornaliero, un editor WYSIWYG di compendi con formule LaTeX e immagini estratte dai tuoi PDF, un tutor chat che aggiorna il testo e quiz con voto in trentesimi.',
  },
  {
    q: 'Posso disdire l’abbonamento Pro quando voglio?',
    a: 'Certamente. La disdetta avviene con un clic dal portale clienti Stripe integrato nell’app, senza vincoli né costi nascosti. Mantieni l’accesso Pro fino alla fine del periodo già pagato.',
  },
];

export default function LandingPage({ theme, toggleTheme, onOpenAuth, onOpenLegal }) {
  const [openFaq, setOpenFaq] = useState(0);
  const [previewTab, setPreviewTab] = useState('map'); // 'map' | 'lesson' | 'quiz'

  return (
    <div
      className={`min-h-screen w-full transition-colors ${
        theme === 'light'
          ? 'bg-[#fdf7f9] text-slate-900'
          : 'bg-[#120a10] text-rose-50'
      }`}
    >
      {/* NAVBAR GLASS */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-rose-200/70 dark:border-[#3e2133] bg-white/85 dark:bg-[#120a10]/85">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logoImg} alt="MinervaAI" className="w-8 h-8 object-contain" />
            <span className="font-extrabold text-lg tracking-tight">
              Minerva<span className="bg-gradient-to-r from-indigo-500 to-blue-500 bg-clip-text text-transparent">AI</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <a href="#features" className="hover:text-indigo-500 transition">Funzionalità</a>
            <a href="#pricing" className="hover:text-indigo-500 transition">Prezzi</a>
            <a href="#faq" className="hover:text-indigo-500 transition">FAQ</a>
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Passa a modalità giorno' : 'Passa a modalità notte'}
              className="p-2 rounded-xl border border-slate-200 dark:border-[#2a2f45] hover:bg-slate-100 dark:hover:bg-[#171a26] transition"
            >
              {theme === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-slate-700" />}
            </button>
            <button
              onClick={() => onOpenAuth('login')}
              className="px-3.5 py-2 text-sm font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-[#171a26] transition"
            >
              Accedi
            </button>
            <button
              onClick={() => onOpenAuth('signup')}
              className="px-4 py-2 text-sm font-bold rounded-xl bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-500 hover:to-teal-400 text-white shadow-lg shadow-indigo-600/25 transition"
            >
              Inizia Gratis
            </button>
          </div>
        </div>
      </header>

      {/* HERO + ANTEPRIMA INTERATTIVA STILE ALGOR */}
      <section className="relative overflow-hidden pt-14 pb-20 sm:pt-20 sm:pb-24 px-4 sm:px-6">
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[780px] h-[360px] rounded-full bg-gradient-to-r from-indigo-500/20 via-purple-500/15 to-teal-400/20 blur-3xl" />

        <div className="relative max-w-5xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/25">
            <Sparkles size={14} />
            Scuole Superiori & Università · Motore Gemini 2.5 Flash & Pro
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.08]">
            Studia più velocemente con{' '}
            <span className="bg-gradient-to-r from-indigo-500 via-rose-500 to-blue-500 bg-clip-text text-transparent">
              Mappe Interattive, Compendi e Quiz AI
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
            Carica i tuoi PDF, dispense o slide: MinervaAI crea il tuo piano di studio giornaliero, genera
            mappe concettuali interattive stile Algor, compendi completi con formule LaTeX, audio-lezioni e verifiche con voto in trentesimi.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-1">
            <button
              onClick={() => onOpenAuth('signup')}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-500 hover:to-teal-400 text-white font-extrabold text-base shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 transition hover:-translate-y-0.5"
            >
              Prova Gratis Ora <ArrowRight size={18} />
            </button>
            <a
              href="#pricing"
              className="w-full sm:w-auto px-8 py-4 rounded-2xl border border-slate-300 dark:border-[#2a2f45] bg-white/70 dark:bg-[#171a26]/80 hover:border-indigo-400 font-bold text-base transition"
            >
              Scopri Piano Pro
            </a>
          </div>

          {/* ANTEPRIMA INTERATTIVA CLICCABILE */}
          <div className="pt-8 max-w-4xl mx-auto">
            <div className="rounded-3xl border border-slate-200/90 dark:border-[#2a2f45] bg-white dark:bg-[#171a26] shadow-2xl shadow-indigo-500/10 overflow-hidden text-left">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-[#2a2f45] flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 dark:bg-[#131622]">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-400" />
                  <span className="w-3 h-3 rounded-full bg-amber-400" />
                  <span className="w-3 h-3 rounded-full bg-emerald-400" />
                  <span className="ml-2 text-xs font-bold text-slate-500 dark:text-slate-400">MinervaAI Studio · Demo Interattiva</span>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-200/70 dark:bg-[#0f111a]">
                  {[
                    { id: 'map', label: 'Mappa Concettuale', icon: Network },
                    { id: 'lesson', label: 'Compendio & Audio', icon: BookOpen },
                    { id: 'quiz', label: 'Quiz 0–30', icon: GraduationCap },
                  ].map((t) => {
                    const Icon = t.icon;
                    const active = previewTab === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setPreviewTab(t.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                          active
                            ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <Icon size={13} />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-6 sm:p-8 algor-dot-grid min-h-[260px] flex items-center justify-center">
                {previewTab === 'map' && (
                  <div className="w-full max-w-2xl space-y-5">
                    <div className="mx-auto w-fit px-6 py-3 rounded-2xl bg-white dark:bg-[#171f36] border-2 border-indigo-500 shadow-lg text-center">
                      <div className="text-sm font-extrabold text-indigo-600 dark:text-indigo-300">Sistema Cardiovascolare</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Arterie, vene e vasi linfatici</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      {[
                        { title: 'Arterie', sub: 'Alta pressione · Legge di Poiseuille', border: 'border-emerald-500', tag: 'trasportano O₂' },
                        { title: 'Vene', sub: 'Valvole anti-reflusso · Ritorno venoso', border: 'border-violet-500', tag: 'ritorno al cuore' },
                        { title: 'Vasi Linfatici', sub: 'Drenaggio fluidi e immunità', border: 'border-amber-500', tag: 'equilibrio' },
                      ].map((n, i) => (
                        <div key={i} className={`p-3.5 rounded-2xl bg-white dark:bg-[#171a26] border-2 ${n.border} shadow-md space-y-1`}>
                          <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#222638] text-slate-500 dark:text-slate-300">
                            {n.tag}
                          </span>
                          <div className="font-extrabold text-sm">{n.title}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{n.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {previewTab === 'lesson' && (
                  <div className="w-full max-w-2xl p-5 rounded-2xl bg-white dark:bg-[#171a26] border border-slate-200 dark:border-[#2a2f45] shadow-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-500">Compendio Completo · Gemini Pro</span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-300 text-[11px] font-bold">
                        <Volume2 size={12} /> Ascolta Audio-Lezione
                      </span>
                    </div>
                    <h4 className="font-extrabold text-base">1. Emodinamica e Legge di Poiseuille</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Il flusso laminare attraverso un vaso cilindrico è direttamente proporzionale alla quarta potenza del raggio: una riduzione del 50% del lume riduce il flusso del 94%.
                    </p>
                    <div className="p-3 rounded-xl bg-indigo-500/10 border-l-4 border-indigo-500 text-xs font-semibold text-indigo-700 dark:text-indigo-200">
                      Regola Cardine: il raggio del vaso è il principale determinante della resistenza vascolare periferica.
                    </div>
                  </div>
                )}

                {previewTab === 'quiz' && (
                  <div className="w-full max-w-2xl p-5 rounded-2xl bg-white dark:bg-[#171a26] border border-slate-200 dark:border-[#2a2f45] shadow-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-500">Valutazione AI Risposta Aperta</span>
                      <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-500 font-extrabold text-sm">29 / 30</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      <strong>Feedback Tutor:</strong> Ottima esposizione della differenza tra chirurgia open ed endovascolare. Per il 30 e Lode cita anche le indicazioni della chirurgia ibrida.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-16 sm:py-20 px-4 sm:px-6 border-t border-slate-200/70 dark:border-[#2a2f45]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <h2 className="text-2xl sm:text-4xl font-extrabold">Tutto il metodo di studio in un&apos;unica piattaforma</h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
              Dalla mappa concettuale visiva fino alla simulazione scritta con voto in trentesimi.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Network,
                color: 'text-teal-500 bg-teal-500/10',
                title: 'Mappe Concettuali Interattive',
                desc: 'Layout Albero e Mappa Mentale, modalità Ripasso Attivo per nascondere i rami, modifica nodi, colori ed export PNG.',
              },
              {
                icon: BookOpen,
                color: 'text-indigo-500 bg-indigo-500/10',
                title: 'Compendi Estesi + Audio TTS',
                desc: 'Lezioni discorsive complete con formule LaTeX, tabelle, immagini dai tuoi PDF, modalità lettura facilitata DSA e sintesi vocale.',
              },
              {
                icon: Calendar,
                color: 'text-violet-500 bg-violet-500/10',
                title: 'Piano di Studio Automatico',
                desc: 'Imposta la data dell’esame o della verifica e ottieni un calendario giornaliero bilanciato che copre tutti i tuoi documenti.',
              },
              {
                icon: GraduationCap,
                color: 'text-amber-500 bg-amber-500/10',
                title: 'Quiz 4 Tipologie & Voto 0–30',
                desc: 'Scelta multipla, completamento, accoppiamento e domande aperte valutate dall’AI con voto, punti di forza e lacune.',
              },
              {
                icon: Mic,
                color: 'text-rose-500 bg-rose-500/10',
                title: 'Tutor Chat & Voce',
                desc: 'Fai domande a voce o via chat sulla lezione e chiedi al tutor di riscrivere, semplificare o arricchire direttamente il testo.',
              },
              {
                icon: FileText,
                color: 'text-cyan-500 bg-cyan-500/10',
                title: 'Multi-File & Export PDF A4',
                desc: 'Carica PDF, Word (.docx), PowerPoint (.pptx) e immagini. Esporta i tuoi compendi impaginati in PDF pronti per la stampa.',
              },
            ].map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  className="p-6 rounded-3xl border border-slate-200 dark:border-[#2a2f45] bg-white dark:bg-[#171a26] shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition"
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${f.color}`}>
                    <Icon size={22} />
                  </div>
                  <h3 className="font-extrabold text-lg mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-16 sm:py-20 px-4 sm:px-6 border-t border-slate-200/70 dark:border-[#2a2f45]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <h2 className="text-2xl sm:text-4xl font-extrabold">Piani semplici e trasparenti</h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
              Inizia gratis per provare MinervaAI. Passa a Pro quando vuoi studiare senza limiti.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* FREE */}
            <div className="p-7 rounded-3xl border border-slate-200 dark:border-[#2a2f45] bg-white dark:bg-[#171a26] flex flex-col justify-between shadow-sm">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Starter</div>
                <h3 className="text-2xl font-extrabold mt-1">Piano Free</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">0 €</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">/mese</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  {[
                    '1 progetto di studio attivo',
                    '3 compendi approfonditi al mese',
                    '2 mappe concettuali interattive al mese',
                    '2 verifiche / quiz AI al mese',
                    '10 messaggi di chat AI al mese',
                    'Audio-lezioni TTS, export PDF e cloud sync',
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check size={16} className="text-teal-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => onOpenAuth('signup')}
                className="mt-8 w-full py-3.5 rounded-2xl border border-slate-300 dark:border-[#2a2f45] hover:bg-slate-100 dark:hover:bg-[#222638] font-bold text-sm transition"
              >
                Registrati Gratis
              </button>
            </div>

            {/* PRO */}
            <div className="p-7 rounded-3xl border-2 border-indigo-500 bg-gradient-to-b from-indigo-600/10 to-white dark:from-indigo-600/15 dark:to-[#171a26] shadow-2xl shadow-indigo-600/15 flex flex-col justify-between relative">
              <div className="absolute -top-3.5 right-6 px-3.5 py-1 rounded-full bg-gradient-to-r from-indigo-600 to-teal-500 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-md">
                <Zap size={12} /> Più scelto
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-500">Accesso Completo</div>
                <h3 className="text-2xl font-extrabold mt-1">MinervaAI Pro</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">14,99 €</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">/mese</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                  {[
                    'Fino a 50 progetti di studio simultanei',
                    'Fino a 120 compendi approfonditi (Gemini 2.5 Pro)',
                    'Fino a 100 mappe concettuali interattive/mese',
                    'Fino a 100 quiz e valutazioni in trentesimi/mese',
                    'Fino a 600 messaggi Tutor Chat & riscritture/mese',
                    'Streaming ultra-rapido, export PNG/PDF e disdetta in 1 clic',
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => onOpenAuth('signup')}
                className="mt-8 w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-500 hover:to-teal-400 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition"
              >
                Inizia e Passa a Pro
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 px-4 sm:px-6 border-t border-slate-200/70 dark:border-[#2a2f45]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center mb-8">Domande frequenti</h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200 dark:border-[#2a2f45] bg-white dark:bg-[#171a26] overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 font-bold text-sm sm:text-base"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 transition-transform ${isOpen ? 'rotate-180 text-indigo-500' : 'text-slate-400'}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10 px-4 sm:px-6 border-t border-slate-200/70 dark:border-[#2a2f45] text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-teal-500" />
            <span>© {new Date().getFullYear()} MinervaAI · Pagamenti sicuri con Stripe</span>
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => onOpenLegal?.('terms')} className="hover:text-indigo-500 transition">
              Termini di Servizio
            </button>
            <button onClick={() => onOpenLegal?.('privacy')} className="hover:text-indigo-500 transition">
              Privacy Policy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
