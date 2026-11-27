import React, { useState, useEffect, useRef } from 'react';
import { Timer, Play, Pause, RotateCcw, Flame } from 'lucide-react';

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getYesterdayKey() {
  const d = new Date(Date.now() - 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function updateStudyStreak() {
  try {
    const today = getTodayKey();
    const yesterday = getYesterdayKey();
    const raw = localStorage.getItem('minerva_study_streak');
    const data = raw ? JSON.parse(raw) : { count: 0, lastDate: null };

    if (data.lastDate === today) {
      return Math.max(1, data.count || 1);
    }
    const nextCount = data.lastDate === yesterday ? (data.count || 0) + 1 : 1;
    localStorage.setItem('minerva_study_streak', JSON.stringify({ count: nextCount, lastDate: today }));
    return nextCount;
  } catch {
    return 1;
  }
}

function playGentleChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  } catch {
    // Audio non disponibile
  }
}

export default function PomodoroStreakBar() {
  const [streak, setStreak] = useState(1);
  const [mode, setMode] = useState('focus'); // 'focus' (25m) | 'break' (5m)
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    setStreak(updateStudyStreak());
  }, []);

  useEffect(() => {
    if (!isRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          playGentleChime();
          const nextMode = mode === 'focus' ? 'break' : 'focus';
          setMode(nextMode);
          setIsRunning(false);
          return nextMode === 'focus' ? 25 * 60 : 5 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isRunning, mode]);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  const handleToggleMode = () => {
    setIsRunning(false);
    const next = mode === 'focus' ? 'break' : 'focus';
    setMode(next);
    setSecondsLeft(next === 'focus' ? 25 * 60 : 5 * 60);
  };

  const handleReset = () => {
    setIsRunning(false);
    setSecondsLeft(mode === 'focus' ? 25 * 60 : 5 * 60);
  };

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {/* STREAK GIORNALIERA */}
      <div
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-[11px] font-extrabold"
        title="Giorni consecutivi di studio su MinervaAI"
      >
        <Flame size={13} className="text-amber-500" />
        <span>{streak}g</span>
      </div>

      {/* POMODORO 25/5 */}
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-bold transition ${
          isRunning
            ? mode === 'focus'
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-300'
              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-300'
            : 'bg-slate-100 dark:bg-geminiDark border-slate-200 dark:border-geminiBorder text-slate-600 dark:text-gray-300'
        }`}
      >
        <button
          type="button"
          onClick={handleToggleMode}
          className="inline-flex items-center gap-1 hover:opacity-80"
          title="Clicca per alternare Studio (25m) / Pausa (5m)"
        >
          <Timer size={12} />
          <span className="hidden sm:inline">{mode === 'focus' ? 'Focus' : 'Pausa'}</span>
        </button>
        <span className="font-mono font-extrabold">{mins}:{secs}</span>
        <button
          type="button"
          onClick={() => setIsRunning((r) => !r)}
          className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition"
          title={isRunning ? 'Metti in pausa' : 'Avvia Pomodoro'}
        >
          {isRunning ? <Pause size={11} /> : <Play size={11} />}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition opacity-70 hover:opacity-100"
          title="Resetta timer"
        >
          <RotateCcw size={11} />
        </button>
      </div>
    </div>
  );
}
