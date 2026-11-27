import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  GraduationCap,
  RefreshCw,
  Award,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { callAiApi, QuotaExceededError } from '../utils/apiClient.js';

export default function OralExamModal({
  isOpen,
  onClose,
  theme = 'dark',
  topicTitle = '',
  examDescription = '',
  lessonContent = '',
  onQuotaExceeded,
}) {
  const [turns, setTurns] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [finalReport, setFinalReport] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatEndRef = useRef(null);

  const speakText = (text) => {
    if (!voiceEnabled || typeof window === 'undefined' || !window.speechSynthesis || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'it-IT';
      utter.rate = 1.02;
      window.speechSynthesis.speak(utter);
    } catch {
      // TTS non supportato
    }
  };

  useEffect(() => {
    if (isOpen && turns.length === 0 && !finalReport) {
      startOralExam();
    }
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, isLoading]);

  const startOralExam = async () => {
    setTurns([]);
    setFinalReport(null);
    setIsLoading(true);
    try {
      const data = await callAiApi({
        action: 'oral_exam_turn',
        topicTitle,
        examDescription,
        lessonContent,
        oralHistory: [],
      });
      const profMsg = data?.professorMessage || `Buongiorno, iniziamo l'esame su ${topicTitle}. Mi introduca l'argomento.`;
      setTurns([{ role: 'professor', text: profMsg }]);
      speakText(profMsg);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        onQuotaExceeded?.(err.message);
        onClose();
      } else {
        setTurns([{ role: 'professor', text: `Errore avvio esame: ${err.message}` }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendAnswer = async (textOverride = null) => {
    const answer = (textOverride !== null ? textOverride : inputText).trim();
    if (!answer || isLoading) return;
    const nextTurns = [...turns, { role: 'student', text: answer }];
    setTurns(nextTurns);
    setInputText('');
    setIsLoading(true);
    try {
      const data = await callAiApi({
        action: 'oral_exam_turn',
        topicTitle,
        examDescription,
        lessonContent,
        oralHistory: nextTurns,
      });
      const profTurn = {
        role: 'professor',
        text: data?.professorMessage || 'Proseguiamo con la domanda successiva.',
        microFeedback: data?.microFeedback || '',
      };
      setTurns([...nextTurns, profTurn]);
      speakText(profTurn.text);
    } catch (err) {
      if (err instanceof QuotaExceededError) onQuotaExceeded?.(err.message);
      else alert(err.message || 'Errore nella risposta del professore.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinishExam = async () => {
    if (isLoading || turns.length < 2) return;
    setIsLoading(true);
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    try {
      const data = await callAiApi({
        action: 'oral_exam_turn',
        topicTitle,
        examDescription,
        lessonContent,
        oralHistory: turns,
        finishOral: true,
      });
      setFinalReport(data?.report || null);
    } catch (err) {
      if (err instanceof QuotaExceededError) onQuotaExceeded?.(err.message);
      else alert(err.message || 'Errore nella valutazione finale.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mr = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setIsTranscribing(true);
        try {
          const reader = new FileReader();
          reader.onloadend = async () => {
            try {
              const res = await callAiApi({
                action: 'transcribe_audio',
                audioBase64: reader.result,
                audioMimeType: mimeType,
              });
              if (res?.text) {
                setInputText((prev) => (prev ? `${prev} ${res.text}` : res.text));
              }
            } catch (err) {
              alert(`Errore trascrizione: ${err.message}`);
            } finally {
              setIsTranscribing(false);
            }
          };
          reader.readAsDataURL(blob);
        } catch {
          setIsTranscribing(false);
        }
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
    } catch {
      alert('Impossibile accedere al microfono. Controlla i permessi del browser.');
    }
  };

  if (!isOpen) return null;

  const studentTurnsCount = turns.filter((t) => t.role === 'student').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div
        className={`w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
          theme === 'light'
            ? 'bg-white border-rose-200 text-slate-900'
            : 'bg-[#1c1018] border-[#3e2133] text-gray-100'
        }`}
      >
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-slate-200/80 dark:border-[#3e2133] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <GraduationCap size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base truncate">Simulatore Esame Orale (Professore AI)</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{topicTitle || examDescription}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setVoiceEnabled((v) => !v);
                if (voiceEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
              }}
              className="p-2 rounded-xl bg-slate-100 dark:bg-[#2b1824] hover:bg-indigo-500/15 transition"
              title={voiceEnabled ? 'Disattiva voce Professore' : 'Attiva voce Professore'}
            >
              {voiceEnabled ? <Volume2 size={15} className="text-indigo-500" /> : <VolumeX size={15} className="text-slate-400" />}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                onClose();
              }}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#2b1824] transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {finalReport ? (
            <div className="space-y-4">
              <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-600/15 to-blue-600/10 border border-indigo-500/30 text-center space-y-2">
                <Award size={34} className="mx-auto text-indigo-500" />
                <div className="text-xs font-extrabold uppercase tracking-wider text-indigo-500">Esito Esame Orale</div>
                <div className="text-4xl font-black">
                  {finalReport.grade}/30{finalReport.laude ? ' e Lode' : ''}
                </div>
                <p className="text-xs sm:text-sm opacity-90 max-w-md mx-auto">{finalReport.verdict}</p>
              </div>

              {Array.isArray(finalReport.strengths) && finalReport.strengths.length > 0 && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-1.5">
                  <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Punti di forza
                  </div>
                  <ul className="text-xs space-y-1 list-disc ml-5">
                    {finalReport.strengths.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}

              {Array.isArray(finalReport.missingPoints) && finalReport.missingPoints.length > 0 && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-1.5">
                  <div className="text-xs font-extrabold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                    <AlertTriangle size={14} /> Cosa hai dimenticato / da ripassare
                  </div>
                  <ul className="text-xs space-y-1 list-disc ml-5">
                    {finalReport.missingPoints.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}

              {finalReport.honorsQuestion && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs">
                  <span className="font-extrabold text-amber-700 dark:text-amber-300">Domanda da 30 e Lode: </span>
                  {finalReport.honorsQuestion}
                </div>
              )}

              <button
                type="button"
                onClick={startOralExam}
                className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition"
              >
                Ripeti Simulazione Orale
              </button>
            </div>
          ) : (
            <>
              {turns.map((t, i) => (
                <div key={i} className={`flex flex-col ${t.role === 'student' ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1 px-1">
                    {t.role === 'professor' ? 'Professore AI' : 'La tua risposta'}
                  </span>
                  <div
                    className={`max-w-[88%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                      t.role === 'student'
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : theme === 'light'
                          ? 'bg-rose-50/70 border border-rose-200 text-slate-800 rounded-tl-none'
                          : 'bg-[#120a10] border border-[#3e2133] text-gray-200 rounded-tl-none'
                    }`}
                  >
                    {t.microFeedback && (
                      <div className="mb-2 pb-2 border-b border-indigo-500/20 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
                        Valutazione: {t.microFeedback}
                      </div>
                    )}
                    <p>{t.text}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <RefreshCw size={13} className="animate-spin text-indigo-500" />
                  <span>Il Professore sta valutando...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </>
          )}
        </div>

        {/* FOOTER INPUT VOCALE + TESTO */}
        {!finalReport && (
          <div className="p-4 border-t border-slate-200/80 dark:border-[#3e2133] space-y-2.5">
            {isTranscribing && (
              <div className="text-[11px] text-indigo-500 font-semibold flex items-center gap-1.5">
                <RefreshCw size={12} className="animate-spin" /> Trascrizione della tua risposta vocale...
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleRecording}
                disabled={isTranscribing || isLoading}
                className={`p-3 rounded-2xl font-bold text-xs flex items-center gap-1.5 transition shrink-0 ${
                  isRecording
                    ? 'bg-rose-600 text-white animate-pulse shadow-lg'
                    : 'bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                }`}
                title="Rispondi a voce al Professore"
              >
                {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                <span className="hidden sm:inline">{isRecording ? 'Stop' : 'Parla'}</span>
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendAnswer(); }}
                placeholder="Rispondi parlando al microfono oppure scrivi qui..."
                className="flex-1 px-4 py-2.5 rounded-2xl text-xs sm:text-sm bg-slate-100 dark:bg-[#120a10] border border-slate-200 dark:border-[#3e2133] outline-none focus:border-indigo-500"
              />

              <button
                type="button"
                onClick={() => handleSendAnswer()}
                disabled={!inputText.trim() || isLoading}
                className="p-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition shrink-0"
              >
                <Send size={15} />
              </button>
            </div>

            {studentTurnsCount >= 1 && (
              <button
                type="button"
                onClick={handleFinishExam}
                disabled={isLoading}
                className="w-full py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-extrabold transition"
              >
                Concludi Esame e Ricevi il Voto in Trentesimi ({studentTurnsCount} risposte date)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
