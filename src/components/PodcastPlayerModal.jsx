import React, { useState, useEffect, useRef } from 'react';
import { X, Headphones, Play, Pause, Square, RefreshCw, Sparkles } from 'lucide-react';
import { streamAiApi, QuotaExceededError } from '../utils/apiClient.js';

export default function PodcastPlayerModal({
  isOpen,
  onClose,
  theme = 'dark',
  topicTitle = '',
  examDescription = '',
  lessonContent = '',
  onQuotaExceeded,
}) {
  const [podcast, setPodcast] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [rate, setRate] = useState(1.05);
  const [errorMsg, setErrorMsg] = useState('');
  const playingRef = useRef(false);

  const stopPlayback = () => {
    playingRef.current = false;
    setIsPlaying(false);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  useEffect(() => {
    return () => stopPlayback();
  }, []);

  useEffect(() => {
    if (!isOpen) stopPlayback();
  }, [isOpen]);

  const handleGenerate = async () => {
    stopPlayback();
    setErrorMsg('');
    setIsGenerating(true);
    try {
      const data = await streamAiApi({
        action: 'generate_podcast_script',
        topicTitle,
        examDescription,
        lessonContent,
      });
      if (data?.podcast?.segments?.length) {
        setPodcast(data.podcast);
        setActiveIdx(0);
      } else {
        setErrorMsg('Impossibile generare il podcast. Riprova.');
      }
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        onQuotaExceeded?.(err.message);
        onClose();
      } else {
        setErrorMsg(err.message || 'Errore nella generazione del podcast.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const speakFromIndex = (startIndex, currentPodcast = podcast) => {
    if (!currentPodcast?.segments?.length || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    playingRef.current = true;
    setIsPlaying(true);

    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('it'));
    const playNext = (idx) => {
      if (!playingRef.current || idx >= currentPodcast.segments.length) {
        playingRef.current = false;
        setIsPlaying(false);
        return;
      }
      setActiveIdx(idx);
      const seg = currentPodcast.segments[idx];
      const utter = new SpeechSynthesisUtterance(seg.text);
      utter.lang = 'it-IT';
      utter.rate = rate;
      // Alterna tono/voce tra Marco (conduttore) ed Elena (professoressa)
      const isHost = String(seg.speaker || '').toLowerCase().includes('marco');
      utter.pitch = isHost ? 0.92 : 1.08;
      if (voices.length >= 2) {
        utter.voice = isHost ? voices[0] : voices[1];
      } else if (voices.length === 1) {
        utter.voice = voices[0];
      }
      utter.onend = () => playNext(idx + 1);
      utter.onerror = () => {
        playingRef.current = false;
        setIsPlaying(false);
      };
      window.speechSynthesis.speak(utter);
    };

    playNext(startIndex);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div
        className={`w-full max-w-2xl max-h-[86vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
          theme === 'light'
            ? 'bg-white border-rose-200 text-slate-900'
            : 'bg-[#1c1018] border-[#3e2133] text-gray-100'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-200/80 dark:border-[#3e2133] flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Headphones size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base truncate">Podcast di Ripasso AI (3–5 min)</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{topicTitle || examDescription}</p>
            </div>
          </div>
          <button onClick={() => { stopPlayback(); onClose(); }} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#2b1824] transition">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {!podcast ? (
            <div className="py-12 text-center space-y-4">
              <Headphones size={40} className="mx-auto text-indigo-500 opacity-85" />
              <div className="space-y-1">
                <h4 className="font-extrabold text-base">Trasforma questa lezione in un Podcast dialogato</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Due voci AI (Marco ed Elena) riassumono e commentano i concetti chiave, i numeri e i trabocchetti d&apos;esame. Perfetto da ascoltare in autobus o prima di dormire.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg transition"
              >
                {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span>{isGenerating ? 'Scrittura episodio in corso...' : 'Crea Episodio Podcast'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* PLAYER BAR */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-600/15 to-blue-600/10 border border-indigo-500/30 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold truncate">{podcast.title || topicTitle}</div>
                  <div className="text-[11px] opacity-75">
                    {podcast.segments.length} battute • Durata stimata: {podcast.durationEstimate || '4 min'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => (isPlaying ? stopPlayback() : speakFromIndex(activeIdx))}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition"
                  >
                    {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                    <span>{isPlaying ? 'Pausa' : 'Ascolta'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { stopPlayback(); setActiveIdx(0); }}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-[#2b1824] hover:bg-indigo-500/15 transition"
                    title="Torna all'inizio"
                  >
                    <Square size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const speeds = [0.9, 1.05, 1.25, 1.45];
                      setRate(speeds[(speeds.indexOf(rate) + 1) % speeds.length]);
                    }}
                    className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-[#2b1824] text-[11px] font-mono font-bold"
                  >
                    {rate}x
                  </button>
                </div>
              </div>

              {/* TRASCRIZIONE SINCRONIZZATA */}
              <div className="space-y-2">
                {podcast.segments.map((seg, i) => {
                  const isActive = i === activeIdx && isPlaying;
                  const isHost = String(seg.speaker || '').toLowerCase().includes('marco');
                  return (
                    <div
                      key={i}
                      onClick={() => speakFromIndex(i)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition text-xs sm:text-sm leading-relaxed ${
                        isActive
                          ? 'bg-indigo-600/15 border-indigo-500 shadow-sm'
                          : theme === 'light'
                            ? 'bg-rose-50/40 border-rose-200/70 hover:border-indigo-300'
                            : 'bg-[#120a10] border-[#3e2133] hover:border-indigo-500/40'
                      }`}
                    >
                      <span
                        className={`inline-block text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1.5 ${
                          isHost
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                        }`}
                      >
                        {seg.speaker}
                      </span>
                      <p>{seg.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
