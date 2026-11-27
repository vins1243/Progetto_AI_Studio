// Utilità di esportazione multi-formato:
// 1. PDF Intero Corso rilegato (copertina + indice + tutte le lezioni generate)
// 2. Documento Microsoft Word (.doc HTML compatibile con Word, Google Docs, Apple Pages)
// 3. Mazzo Anki (.txt separato da tab importabile in 1 clic su Anki)

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function exportAnkiDeck(cards = [], deckTitle = 'MinervaAI_Flashcards') {
  if (!Array.isArray(cards) || cards.length === 0) {
    alert('Nessuna flashcard disponibile da esportare.');
    return;
  }
  const cleanField = (txt = '') =>
    String(txt)
      .replace(/\t/g, ' ')
      .replace(/\r?\n/g, '<br>')
      .trim();

  const header = '#separator:tab\n#html:true\n#tags column:3\n';
  const rows = cards.map((c) => {
    const tag = String(c.tag || c.topicTitle || 'MinervaAI')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_àèéìòùÀÈÉÌÒÙ-]/g, '');
    return `${cleanField(c.front)}\t${cleanField(c.back)}\t${tag}`;
  });

  const blob = new Blob([header + rows.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${String(deckTitle).replace(/[^a-z0-9]/gi, '_')}_Anki.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportLessonToWord({ topicTitle = 'Lezione', examName = 'Studio', bodyHtml = '', tfQuestions = [] }) {
  const vfHtml =
    Array.isArray(tfQuestions) && tfQuestions.length > 0
      ? `<div style="margin-top:20px;padding:12px 15px;background:#fdf2f8;border:1px solid #f3d5e0;">
          <h2 style="color:#881337;margin-top:0;">Verifica Rapida (Vero o Falso)</h2>
          <ol>
            ${tfQuestions
              .map(
                (q) =>
                  `<li style="margin-bottom:6px;"><strong>${escapeHtml(q.statement)}</strong><br/><span>Risposta: <strong>${q.correctAnswer ? 'Vero' : 'Falso'}</strong>${q.explanation ? ` — ${escapeHtml(q.explanation)}` : ''}</span></li>`
              )
              .join('')}
          </ol>
        </div>`
      : '';

  const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="it">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(topicTitle)} — MinervaAI</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1e293b; }
    h1 { font-size: 18pt; color: #881337; border-bottom: 2px solid #be123c; padding-bottom: 6px; }
    h2 { font-size: 14pt; color: #9f1239; margin-top: 16pt; }
    h3 { font-size: 12pt; color: #a21caf; margin-top: 12pt; }
    p, li { text-align: justify; }
    table { width: 100%; border-collapse: collapse; margin: 10pt 0; }
    th { background: #fdf2f8; color: #881337; border: 1px solid #d1d5db; padding: 6pt; text-align: left; }
    td { border: 1px solid #d1d5db; padding: 6pt; vertical-align: top; }
    blockquote { background: #fff1f2; border-left: 4px solid #be123c; padding: 8pt 12pt; color: #4c0519; }
  </style>
</head>
<body>
  <p style="font-size:9pt;color:#be123c;font-weight:bold;text-transform:uppercase;">MinervaAI • Compendio Didattico</p>
  <h1>${escapeHtml(topicTitle)}</h1>
  <p style="font-size:10pt;color:#475569;"><strong>Materia:</strong> ${escapeHtml(examName)} • Esportato il ${new Date().toLocaleDateString('it-IT')}</p>
  ${bodyHtml}
  ${vfHtml}
</body>
</html>`;

  const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${String(topicTitle).replace(/[^a-z0-9]/gi, '_')}_MinervaAI.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportFullCoursePDF({ activeProject, renderMarkdownAndLatexToHtml, splitLessonAndTrueFalse, imagesMap = {} }) {
  if (!activeProject || !Array.isArray(activeProject.schedule)) return;

  const lessons = [];
  activeProject.schedule.forEach((day) => {
    (day.topics || []).forEach((t) => {
      if (t?.lesson && t.lesson.trim().length > 20) {
        lessons.push({
          dayNumber: day.dayNumber,
          dayTitle: day.dayTitle || `Giorno ${day.dayNumber}`,
          title: t.title || 'Lezione',
          lesson: t.lesson,
        });
      }
    });
  });

  if (lessons.length === 0) {
    alert('Genera almeno una lezione prima di esportare il PDF completo del corso.');
    return;
  }

  const tocHtml = lessons
    .map(
      (l, i) =>
        `<li><strong>${i + 1}. ${escapeHtml(l.title)}</strong> <span style="color:#64748b;font-size:9pt;">(Giorno ${l.dayNumber})</span></li>`
    )
    .join('');

  const chaptersHtml = lessons
    .map((l, i) => {
      const { cleanLesson, questions } = splitLessonAndTrueFalse(l.lesson);
      const rendered = renderMarkdownAndLatexToHtml(cleanLesson, imagesMap);
      const vfHtml =
        questions && questions.length > 0
          ? `<section class="vf-section">
              <h3>Verifica Rapida (Vero o Falso)</h3>
              <ol class="vf-list">
                ${questions
                  .map(
                    (q) =>
                      `<li><strong>${escapeHtml(q.statement)}</strong><br/><span class="vf-ans">Risposta: <strong>${q.correctAnswer ? 'Vero' : 'Falso'}</strong>${q.explanation ? ` — ${escapeHtml(q.explanation)}` : ''}</span></li>`
                  )
                  .join('')}
              </ol>
            </section>`
          : '';
      return `<article class="chapter">
        <div class="chapter-kicker">Capitolo ${i + 1} • Giorno ${l.dayNumber}</div>
        <h1 class="chapter-title">${escapeHtml(l.title)}</h1>
        ${rendered}
        ${vfHtml}
      </article>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(activeProject.description || 'Corso')} — Dispensa Completa MinervaAI</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous" />
  <style>
    @page { size: A4 portrait; margin: 16mm 17mm 18mm 17mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body {
      margin: 0; padding: 0; background: #ffffff; color: #1e293b;
      font-family: "Plus Jakarta Sans", "Inter", sans-serif; font-size: 10.2pt; line-height: 1.66;
    }
    .cover {
      min-height: 245mm; display: flex; flex-direction: column; justify-content: center;
      border: 2px solid #f3d5e0; border-radius: 14px; padding: 36px; background: #fffafb;
      page-break-after: always; break-after: page;
    }
    .cover-brand { color: #be123c; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; font-size: 10pt; margin-bottom: 14px; }
    .cover-title { font-size: 28pt; font-weight: 800; color: #0f172a; line-height: 1.2; margin: 0 0 14px 0; }
    .cover-meta { font-size: 10.5pt; color: #475569; margin-bottom: 28px; }
    .toc-box { background: #ffffff; border: 1px solid #f3d5e0; border-radius: 10px; padding: 18px 22px; }
    .toc-box h2 { margin: 0 0 10px 0; font-size: 12pt; color: #881337; text-transform: uppercase; letter-spacing: 0.05em; }
    .toc-box ol { margin: 0; padding-left: 18px; }
    .toc-box li { margin-bottom: 5px; font-size: 10pt; }
    .chapter { page-break-before: always; break-before: page; }
    .chapter-kicker { color: #be123c; font-weight: 800; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; }
    .chapter-title { font-size: 18pt; font-weight: 800; color: #0f172a; border-bottom: 2px solid #be123c; padding-bottom: 8px; margin: 4px 0 16px 0; }
    h2 { font-size: 12.8pt; font-weight: 800; color: #9f1239; margin: 16px 0 6px; page-break-after: avoid; }
    h3 { font-size: 11pt; font-weight: 700; color: #a21caf; margin: 12px 0 5px; page-break-after: avoid; }
    p, li { text-align: justify; hyphens: auto; }
    p { margin: 0 0 8px 0; }
    ul, ol { margin: 4px 0 10px 20px; padding: 0; }
    li { margin-bottom: 4px; page-break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9.2pt; }
    th { background: #fdf2f8; color: #881337; font-weight: 700; text-align: left; padding: 6px 8px; border: 1px solid #f3d5e0; }
    td { padding: 6px 8px; border: 1px solid #e2e8f0; vertical-align: top; }
    blockquote { background: #fff1f2; border-left: 3.5px solid #be123c; padding: 9px 13px; border-radius: 6px; margin: 10px 0; color: #4c0519; text-align: justify; }
    img { max-width: 88%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; display: block; margin: 10px auto; }
    .vf-section { margin-top: 16px; padding: 11px 14px; background: #fdf2f8; border: 1px solid #f3d5e0; border-radius: 8px; page-break-inside: avoid; }
    .vf-section h3 { margin-top: 0; color: #881337; }
    .vf-ans { color: #475569; font-size: 9pt; }
  </style>
</head>
<body>
  <section class="cover">
    <div class="cover-brand">MinervaAI • Dispensa Completa del Corso</div>
    <h1 class="cover-title">${escapeHtml(activeProject.description || 'Corso di Studio')}</h1>
    <div class="cover-meta">
      <strong>${lessons.length} lezioni complete</strong>
      ${activeProject.examDate ? ` • Data esame: <strong>${escapeHtml(activeProject.examDate)}</strong>` : ''}
      • Generato il ${new Date().toLocaleDateString('it-IT')}
    </div>
    <div class="toc-box">
      <h2>Indice dei Capitoli</h2>
      <ol>${tocHtml}</ol>
    </div>
  </section>
  ${chaptersHtml}
  <script>
    window.onload = function() {
      setTimeout(function() { window.focus(); window.print(); }, 450);
    };
  </script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=1050');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } else {
    alert('Abilita i popup per esportare il PDF completo del corso.');
  }
}
