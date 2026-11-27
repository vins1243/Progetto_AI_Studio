import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Check, X, RotateCcw, ListChecks } from 'lucide-react';

// Estrae le domande Vero o Falso dalla sezione "## Verifica Rapida (Vero o Falso)" della lezione
export function splitLessonAndTrueFalse(markdownText = '') {
  if (!markdownText) return { cleanLesson: '', questions: [] };

  const headingRegex = /\n#{1,3}\s*Verifica Rapida\s*\(Vero o Falso\)[^\n]*/i;
  const match = markdownText.match(headingRegex);
  if (!match || match.index === undefined) {
    return { cleanLesson: markdownText, questions: [] };
  }

  const cleanLesson = markdownText.slice(0, match.index).trim();
  const vfBlock = markdownText.slice(match.index + match[0].length).trim();

  // Raggruppa righe numerate (1. ... / 2. ... / 3. ...) anche se la risposta va a capo
  const rawItems = [];
  const lines = vfBlock.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^\d+\.\s+/.test(line)) {
      rawItems.push(line.replace(/^\d+\.\s+/, '').trim());
    } else if (rawItems.length > 0) {
      rawItems[rawItems.length - 1] += ' ' + line;
    }
  }

  const questions = [];
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    // Riconosce pattern: "Affermazione. **Vero**: spiegazione" oppure "Affermazione. (Falso - spiegazione)" oppure "Affermazione. Falso: spiegazione"
    const ansMatch = item.match(/^(.*?)[\s\u00A0]+(?:\*\*|\()?(\bVero\b|\bFalso\b)(?:\*\*|\))?[:\-\s–—]*(.*)$/i);
    if (ansMatch) {
      const statement = ansMatch[1].replace(/\*\*/g, '').replace(/\($/, '').trim();
      const isTrue = ansMatch[2].toLowerCase() === 'vero';
      const explanation = ansMatch[3].replace(/\*\*/g, '').replace(/\)$/, '').trim();
      if (statement.length > 8) {
        questions.push({
          id: `vf_${i}`,
          statement,
          correctAnswer: isTrue,
          explanation,
        });
      }
    }
  }

  if (questions.length === 0) {
    return { cleanLesson: markdownText, questions: [] };
  }
  return { cleanLesson, questions };
}

export default function QuickTrueFalseWidget({ questions = [], topicId = '', onWrongAnswer }) {
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    setAnswers({});
  }, [topicId, questions.length]);

  if (!questions || questions.length === 0) return null;

  const answeredCount = Object.keys(answers).length;
  const correctCount = questions.filter((q) => answers[q.id] === q.correctAnswer).length;

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25">
            <ListChecks size={16} />
          </div>
          <div>
            <h3 className="text-base font-extrabold leading-tight">Verifica Rapida (Vero o Falso)</h3>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              Metti alla prova i concetti chiave di questa lezione prima di andare avanti
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {answeredCount > 0 && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
              {correctCount} / {questions.length} corrette
            </span>
          )}
          {answeredCount > 0 && (
            <button
              onClick={() => setAnswers({})}
              className="px-2.5 py-1 rounded-xl text-xs font-semibold border border-geminiBorder hover:bg-geminiHover flex items-center gap-1 transition"
            >
              <RotateCcw size={12} /> Ripeti
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3.5">
        {questions.map((q, idx) => {
          const userChoice = answers[q.id]; // true | false | undefined
          const hasAnswered = userChoice !== undefined;
          const isUserCorrect = hasAnswered && userChoice === q.correctAnswer;

          const renderOptionButton = (val, label) => {
            const isSelected = userChoice === val;
            const isCorrectOption = q.correctAnswer === val;

            let cls =
              'border-geminiBorder/80 bg-geminiDark/60 hover:border-indigo-500/60 hover:bg-geminiHover/60 text-slate-800 dark:text-gray-200';
            if (hasAnswered) {
              if (isSelected && isCorrectOption) {
                cls = 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold shadow-sm shadow-emerald-500/20';
              } else if (isSelected && !isCorrectOption) {
                cls = 'border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-400 font-bold shadow-sm shadow-rose-500/20';
              } else if (!isSelected && isCorrectOption) {
                cls = 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold';
              } else {
                cls = 'border-geminiBorder/40 opacity-50 text-slate-400 dark:text-gray-400';
              }
            }

            return (
              <button
                type="button"
                disabled={hasAnswered}
                onClick={() => {
                  setAnswers((prev) => ({ ...prev, [q.id]: val }));
                  if (val !== q.correctAnswer && typeof onWrongAnswer === 'function') {
                    onWrongAnswer({
                      question: q.statement,
                      correctAnswer: q.correctAnswer ? 'Vero' : 'Falso',
                      explanation: q.explanation || '',
                    });
                  }
                }}
                className={`flex-1 py-3 px-4 rounded-2xl border-2 text-sm font-semibold flex items-center justify-center gap-2 transition ${cls}`}
              >
                {hasAnswered && isSelected && isCorrectOption && <Check size={16} />}
                {hasAnswered && isSelected && !isCorrectOption && <X size={16} />}
                <span>{label}</span>
              </button>
            );
          };

          return (
            <div
              key={q.id}
              className="p-5 rounded-3xl border border-geminiBorder bg-geminiDarkSecondary shadow-md space-y-3.5"
            >
              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-lg bg-indigo-600/20 text-indigo-400 font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <p className="text-sm font-semibold leading-relaxed">
                  {q.statement}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {renderOptionButton(true, 'Vero')}
                {renderOptionButton(false, 'Falso')}
              </div>

              {hasAnswered && q.explanation && (
                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed flex items-start gap-2 border ${
                    isUserCorrect
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
                  }`}
                >
                  {isUserCorrect ? (
                    <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-400" />
                  ) : (
                    <XCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                  )}
                  <div>
                    <strong>{isUserCorrect ? 'Esatto! ' : `Risposta corretta: ${q.correctAnswer ? 'Vero' : 'Falso'}. `}</strong>
                    {q.explanation}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
