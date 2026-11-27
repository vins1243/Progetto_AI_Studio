import React, { useState, useRef, useEffect } from 'react';
import { X, Mic, Square, UploadCloud, RefreshCw, Sparkles, CheckCircle2, FileAudio } from 'lucide-react';
import { callAiApi, QuotaExceededError } from '../utils/apiClient.js';

export default function LectureRecorderModal({
  isOpen,
  onClose,
  theme = 'dark',
  examDescription = '',
  onSaveAsLesson,
  onQuotaExceeded,
}) {
  const [lectureTitle, setLectureTitle] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioFileName, setAudioFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isRecording) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  const startRecording = async () => {
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioFileName(`Lezione_registrata_${new Date().toLocaleTimeString('it-IT').replace(/:/g, '-')}.webm`);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setElapsedSec(0);
      setAudioBlob(null);
      setResult(null);
      setIsRecording(true);
    } catch {
      setErrorMsg('Impossibile accedere al microfono. Verifica i permessi del browser.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 18 * 1024 * 1024) {
      setErrorMsg('File audio troppo grande (max 18 MB per trascrizione diretta).');
      return;
    }
    setErrorMsg('');
    setAudioBlob(file);
    setAudioFileName(file.name);
    setResult(null);
  };

  const handleTranscribeAndStructure = async () => {
    if (!audioBlob) return;
    setErrorMsg('');
    setIsProcessing(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Errore lettura file audio'));
        reader.readAsDataURL(audioBlob);
      });

      const data = await callAiApi({
        action: 'transcribe_lecture_to_notes',
        topicTitle: lectureTitle.trim() || audioFileName || 'Sbobina Lezione in Aula',
        examDescription,
        audioBase64: base64,
        audioMimeType: audioBlob.type || 'audio/webm',
      });
      setResult({
        title: lectureTitle.trim() || `Sbobina — ${new Date().toLocaleDateString('it-IT')}`,
        transcript: data.transcript || '',
        notes: data.notes || '',
      });
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        onQuotaExceeded?.(err.message);
        onClose();
      } else {
        setErrorMsg(err.message || 'Errore nella trascrizione della lezione.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div
        className={`w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
          theme === 'light'
            ? 'bg-white border-rose-200 text-slate-900'
            : 'bg-[#1c1018] border-[#3e2133] text-gray-100'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-200/80 dark:border-[#3e2133] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
              <FileAudio size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">Sbobina AI — Registra o Carica Lezione</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Trasforma la voce del professore in appunti strutturati</p>
            </div>
          </div>
          <button onClick={() => { if (isRecording) stopRecording(); onClose(); }} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#2b1824] transition">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold mb-1.5 opacity-80">Titolo della lezione (opzionale)</label>
            <input
              type="text"
              value={lectureTitle}
              onChange={(e) => setLectureTitle(e.target.value)}
              placeholder="es. Lezione 4 — Insufficienza Venosa Cronica"
              className="w-full px-4 py-2.5 rounded-2xl text-xs sm:text-sm bg-slate-100 dark:bg-[#120a10] border border-slate-200 dark:border-[#3e2133] outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-5 rounded-2xl border-2 text-center space-y-2 transition ${
                isRecording
                  ? 'bg-rose-500/15 border-rose-500 text-rose-600 dark:text-rose-300 animate-pulse'
                  : 'bg-slate-50 dark:bg-[#120a10] border-slate-200 dark:border-[#3e2133] hover:border-indigo-500'
              }`}
            >
              {isRecording ? <Square size={24} className="mx-auto text-rose-500" /> : <Mic size={24} className="mx-auto text-indigo-500" />}
              <div className="text-xs font-extrabold">{isRecording ? `Ferma Registrazione (${mm}:${ss})` : 'Registra dal Vivo in Aula'}</div>
              <div className="text-[11px] opacity-70">{isRecording ? 'Registrazione attiva...' : 'Usa il microfono del dispositivo'}</div>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRecording}
              className="p-5 rounded-2xl border-2 border-dashed border-slate-300 dark:border-[#3e2133] hover:border-indigo-500 bg-slate-50 dark:bg-[#120a10] text-center space-y-2 transition disabled:opacity-40"
            >
              <UploadCloud size={24} className="mx-auto text-indigo-500" />
              <div className="text-xs font-extrabold">Carica Audio (.mp3 / .m4a / .wav)</div>
              <div className="text-[11px] opacity-70">Registrazione già salvata (max 18 MB)</div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg"
              onChange={handleFilePick}
              className="hidden"
            />
          </div>

          {audioBlob && !result && (
            <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-bold truncate">Audio pronto: {audioFileName}</div>
              <button
                type="button"
                onClick={handleTranscribeAndStructure}
                disabled={isProcessing}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition"
              >
                {isProcessing ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                <span>{isProcessing ? 'Sbobinatura AI in corso...' : 'Genera Sbobina & Appunti'}</span>
              </button>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 size={16} /> Sbobina strutturata pronta!
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSaveAsLesson?.(result);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition"
                >
                  Salva come Lezione nel Corso
                </button>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#120a10] border border-slate-200 dark:border-[#3e2133] max-h-64 overflow-y-auto text-xs whitespace-pre-wrap leading-relaxed">
                {result.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
