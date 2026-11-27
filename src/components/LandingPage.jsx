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
    a: 'Oltre alle mappe concettuali interattive modificabili ed esportabili, MinervaAI integra un pianificatore d’esame giornaliero (Syllabus), un editor WYSIWYG di compendi con formule LaTeX e export PDF A4, un tutor chat che modifica direttamente la lezione e quiz con valutazione AI in trentesimi.',
  },
  {
    q: 'Posso disdire l’abbonamento Pro quando voglio?',
    a: 'Certamente. La disdetta avviene con un clic dal portale clienti Stripe integrato nell’app, senza vincoli né costi nascosti. Mantieni l’accesso Pro fino alla fine del periodo già pagato.',
  },
];

export default function LandingPage({ theme, toggleTheme, onOpenAuth, onOpenLegal }) {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div
      className={`min-h-screen w-full transition-colors ${
        theme === 'light'
          ? 'bg-[#f8fafc] text-slate-900'
          : 'bg-[#131314] text-gray-100'
      }`}
    >
      {/* NAVBAR */}
      <header className="sticky top-0 z-40 backdrop-blur-md border-b border-slate-200/80 dark:border-[#2a2b2f] bg-white/80 dark:bg-[#131314]/85">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logoImg} alt="MinervaAI" className="w-8 h-8 object-contain" />
            <span className="font-bold text-lg tracking-tight">
              Minerva<span className="text-blue-500">AI</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-gray-300">
            <a href="#features" className="hover:text-blue-500 transition">Funzionalità</a>
            <a href="#pricing" className="hover:text-blue-500 transition">Prezzi</a>
            <a href="#faq" className="hover:text-blue-500 transition">FAQ</a>
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Passa a modalità giorno' : 'Passa a modalità notte'}
              className="p-2 rounded-xl border border-slate-200 dark:border-[#2a2b2f] hover:bg-slate-100 dark:hover:bg-[#1e1f20] transition"
            >
              {theme === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-slate-700" />}
            </button>
            <button
              onClick={() => onOpenAuth('login')}
              className="px-3.5 py-2 text-sm font-semibold rounded-xl hover:bg-slate-100 dark:hover:bg-[#1e1f20] transition"
            >
              Accedi
            </button>
            <button
              onClick={() => onOpenAuth('signup')}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25 transition"
            >
              Inizia Gratis
            </button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Sparkles size={14} />
            Per Scuole Superiori e Università · Alimentato da Gemini Flash & Pro
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1]">
            Trasforma PDF, dispense e appunti in{' '}
            <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 bg-clip-text text-transparent">
              Mappe Concettuali, Compendi e Quiz
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-600 dark:text-gray-400 leading-relaxed">
            La piattaforma di studio AI all-in-one ispirata al meglio della didattica visuale, ma più completa:
            carica i tuoi file, ottieni un piano di studio giornaliero, genera mappe interattive modificabili,
            studia compendi con formule LaTeX ed esercitati con valutazioni in trentesimi.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
            <button
              onClick={() => onOpenAuth('signup')}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-base shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 transition"
            >
              Prova Gratis Ora <ArrowRight size={18} />
            </button>
            <a
              href="#pricing"
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl border border-slate-300 dark:border-[#37393b] hover:bg-slate-100 dark:hover:bg-[#1e1f20] font-semibold text-base transition"
            >
              Scopri Piano Pro
            </a>
          </div>

          <p className="text-xs text-slate-500 dark:text-gray-500">
            Nessuna carta di credito richiesta per il piano Free · Sincronizzazione cloud multi-dispositivo
          </p>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-16 sm:py-20 px-4 sm:px-6 border-t border-slate-200/70 dark:border-[#2a2b2f]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <h2 className="text-2xl sm:text-4xl font-bold">Tutto ciò che serve per preparare un esame, in un solo posto</h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-gray-400">
              Dalla comprensione visiva con mappe concettuali fino alla simulazione scritta con voto.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Network,
                color: 'text-emerald-500 bg-emerald-500/10',
                title: 'Mappe Concettuali Interattive',
                desc: 'Genera mappe gerarchiche modificabili dai tuoi PDF o dalle lezioni. Zoom, pan, modifica nodi, colori personalizzati ed export PNG/PDF.',
              },
              {
                icon: BookOpen,
                color: 'text-blue-500 bg-blue-500/10',
                title: 'Compendi & Editor WYSIWYG',
                desc: 'Lezioni strutturate con tabelle, formule LaTeX, immagini estratte dai tuoi file, riscrittura AI su selezione ed export PDF A4 pulito.',
              },
              {
                icon: Calendar,
                color: 'text-violet-500 bg-violet-500/10',
                title: 'Piano di Studio Automatico',
                desc: 'Imposta la data dell’esame o della verifica e ottieni un calendario giornaliero bilanciato che copre il 100% dei tuoi documenti.',
              },
              {
                icon: GraduationCap,
                color: 'text-amber-500 bg-amber-500/10',
                title: 'Quiz 4 Tipologie & Voto 0–30',
                desc: 'Scelta multipla, completamento, accoppiamento e domande aperte corrette dall’AI con voto in trentesimi, punti di forza e lacune.',
              },
              {
                icon: Mic,
                color: 'text-rose-500 bg-rose-500/10',
                title: 'Tutor Chat & Dettatura Vocale',
                desc: 'Fai domande a voce o via chat sulla lezione e chiedi al tutor di aggiornare o semplificare direttamente il testo del compendio.',
              },
              {
                icon: FileText,
                color: 'text-cyan-500 bg-cyan-500/10',
                title: 'Lettura Multi-File Intelligente',
                desc: 'Carica PDF, Word (.docx), PowerPoint (.pptx) e immagini: il motore seleziona automaticamente i passaggi più pertinenti per ogni argomento.',
              },
            ].map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  className="p-6 rounded-3xl border border-slate-200 dark:border-[#2a2b2f] bg-white dark:bg-[#1e1f20] shadow-sm hover:shadow-md transition"
                >
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-4 ${f.color}`}>
                    <Icon size={22} />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-gray-400 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-16 sm:py-20 px-4 sm:px-6 border-t border-slate-200/70 dark:border-[#2a2b2f]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <h2 className="text-2xl sm:text-4xl font-bold">Piani semplici e trasparenti</h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-gray-400">
              Inizia gratis per testare la qualità di MinervaAI. Passa a Pro quando vuoi studiare senza limiti.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* FREE */}
            <div className="p-7 rounded-3xl border border-slate-200 dark:border-[#2a2b2f] bg-white dark:bg-[#1e1f20] flex flex-col justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Starter</div>
                <h3 className="text-2xl font-bold mt-1">Piano Free</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">0 €</span>
                  <span className="text-sm text-slate-500 dark:text-gray-400">/mese</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-slate-600 dark:text-gray-300">
                  {[
                    '1 progetto di studio attivo',
                    '3 compendi / lezioni AI al mese',
                    '2 mappe concettuali interattive al mese',
                    '2 verifiche / quiz AI al mese',
                    '10 messaggi di chat AI al mese',
                    'Export PDF e sincronizzazione cloud',
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => onOpenAuth('signup')}
                className="mt-8 w-full py-3 rounded-2xl border border-slate-300 dark:border-[#37393b] hover:bg-slate-100 dark:hover:bg-[#282a2c] font-bold text-sm transition"
              >
                Registrati Gratis
              </button>
            </div>

            {/* PRO */}
            <div className="p-7 rounded-3xl border-2 border-blue-500 bg-gradient-to-b from-blue-600/10 to-white dark:from-blue-600/15 dark:to-[#1e1f20] shadow-xl shadow-blue-600/10 flex flex-col justify-between relative">
              <div className="absolute -top-3.5 right-6 px-3 py-1 rounded-full bg-blue-600 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Zap size={12} /> Più scelto
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-blue-500">Accesso Completo</div>
                <h3 className="text-2xl font-bold mt-1">MinervaAI Pro</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">14,99 €</span>
                  <span className="text-sm text-slate-500 dark:text-gray-400">/mese</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-slate-700 dark:text-gray-200">
                  {[
                    'Fino a 50 progetti di studio simultanei',
                    'Fino a 120 compendi approfonditi (Gemini Pro)',
                    'Fino a 100 mappe concettuali interattive/mese',
                    'Fino a 100 quiz e valutazioni in trentesimi/mese',
                    'Fino a 600 messaggi Tutor Chat & riscritture/mese',
                    'Streaming ultra-rapido, export PNG/PDF e disdetta in 1 clic',
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check size={16} className="text-blue-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => onOpenAuth('signup')}
                className="mt-8 w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition"
              >
                Inizia e Passa a Pro
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 px-4 sm:px-6 border-t border-slate-200/70 dark:border-[#2a2b2f]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">Domande frequenti</h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200 dark:border-[#2a2b2f] bg-white dark:bg-[#1e1f20] overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 font-semibold text-sm sm:text-base"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 transition-transform ${isOpen ? 'rotate-180 text-blue-500' : 'text-slate-400'}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-sm text-slate-600 dark:text-gray-400 leading-relaxed">
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
      <footer className="py-10 px-4 sm:px-6 border-t border-slate-200/70 dark:border-[#2a2b2f] text-xs text-slate-500 dark:text-gray-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-emerald-500" />
            <span>© {new Date().getFullYear()} MinervaAI · Pagamenti sicuri con Stripe</span>
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => onOpenLegal?.('terms')} className="hover:text-blue-500 transition">
              Termini di Servizio
            </button>
            <button onClick={() => onOpenLegal?.('privacy')} className="hover:text-blue-500 transition">
              Privacy Policy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
