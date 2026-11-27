// Netlify Function v2 - Endpoint AI unificato con Auth JWT, Quote Freemium/Pro,
// Routing Gemini Flash (leggero) / Gemini Pro (pesante), Chunking intelligente e Streaming SSE.

import {
  verifySupabaseUser,
  getOrCreateProfile,
  getQuotaBucketForAction,
  checkQuota,
  incrementUsage,
} from './_lib/authAndQuota.js';
import {
  generateAI,
  streamAIResponse,
  transcribeAudio,
  extractRelevantChunks,
  createSmartFileDigest,
} from './_lib/aiProvider.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function safeParseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    try {
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      }
    } catch {
      // ignore
    }
    return fallback;
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  // 1. Verifica autenticazione Supabase JWT
  const auth = await verifySupabaseUser(req);
  if (auth.error) {
    return jsonResponse({ error: auth.error, code: 'UNAUTHORIZED' }, auth.status || 401);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Payload JSON non valido.' }, 400);
  }

  const {
    action,
    stream = false,
    prompt,
    history,
    file,
    files,
    sourceType,
    isLessonGeneration,
    topicTitle,
    examDescription,
    daysTotal,
    prepLevel,
    languageStyle,
    selectedText,
    rewriteMode,
    fullContext,
    lessonContent,
    lessonChatHistory,
    topicsList,
    questionTypes,
    numQuestions,
    difficulty,
    question,
    idealAnswerCriteria,
    studentAnswer,
    audioBase64,
    audioMimeType,
    mapStyle,
  } = payload;

  try {
    // 2. Carica profilo e verifica quote mensili
    const profile = await getOrCreateProfile(auth.user);

    if (action === 'get_usage') {
      const status = checkQuota(profile, null);
      return jsonResponse({
        pro: status.pro,
        usage: status.usage,
        limits: status.limits,
        planType: profile.plan_type || (status.pro ? 'pro_monthly_14.99' : 'free'),
        subscriptionStatus: profile.subscription_status || (status.pro ? 'active' : 'free'),
      });
    }

    const bucket = getQuotaBucketForAction(action, isLessonGeneration);
    const quota = checkQuota(profile, bucket);
    if (!quota.allowed) {
      return jsonResponse(
        {
          error: quota.error,
          code: 'QUOTA_EXCEEDED',
          bucket: quota.bucket,
          pro: quota.pro,
          usage: quota.usage,
          limits: quota.limits,
        },
        402
      );
    }

    const allFiles = Array.isArray(files) ? files : file ? [file] : [];

    // -------------------------------------------------------------
    // AZIONE 1: TRASCRIZIONE VOCALE (GEMINI FLASH -> FALLBACK WHISPER)
    // -------------------------------------------------------------
    if (action === 'transcribe_audio') {
      if (!audioBase64) {
        return jsonResponse({ error: 'Nessun file audio ricevuto.' }, 400);
      }
      const result = await transcribeAudio({ audioBase64, audioMimeType });
      return jsonResponse({ text: result.text || '', modelUsed: result.modelUsed });
    }

    // -------------------------------------------------------------
    // AZIONE 2: GENERAZIONE MAPPA CONCETTUALE INTERATTIVA (ALGOR+ - GEMINI FLASH)
    // -------------------------------------------------------------
    if (action === 'generate_concept_map') {
      const focusTitle = (topicTitle || prompt || examDescription || 'Mappa Concettuale').trim();
      const sourceText = (lessonContent || '').trim() ||
        extractRelevantChunks(allFiles, `${focusTitle} ${examDescription || ''}`, 28000);

      const mapSystemPrompt = `Sei un esperto di didattica visuale e mappe concettuali (stile Algor Education) per studenti delle scuole superiori e dell'università.
Crea una mappa concettuale gerarchica, chiara, sintetica e logicamente strutturata sull'argomento richiesto.

REGOLE DI STRUTTURA JSON OBBLIGATORIE:
Restituisci ESCLUSIVAMENTE un JSON valido con questa struttura esatta:
{
  "title": "Titolo della mappa",
  "layout": "${mapStyle || 'tree'}",
  "nodes": [
    {
      "id": "root",
      "label": "Concetto Centrale (max 5-6 parole)",
      "summary": "Definizione chiara e completa in 1-2 frasi (max 220 caratteri)",
      "level": 0,
      "parentId": null,
      "color": "blue"
    },
    {
      "id": "n1",
      "label": "Ramo Principale 1",
      "summary": "Spiegazione sintetica ma precisa del sottotema",
      "level": 1,
      "parentId": "root",
      "color": "emerald",
      "edgeLabel": "si divide in / comprende"
    }
  ]
}

VINCOLI DIDATTICI:
1. Genera tra 10 e 18 nodi totali distribuiti su 3 livelli (level 0 = 1 nodo centrale "root", level 1 = 3-5 rami principali, level 2 = 2-3 sotto-nodi per ogni ramo principale).
2. Ogni nodo figlio DEVE avere "parentId" uguale all'"id" del nodo genitore esistente.
3. Usa etichette ("label") brevi, memorabili e scansionabili (max 45 caratteri); metti i dettagli, date, formule o definizioni nel campo "summary".
4. Usa "color" scegliendo tra: "blue", "emerald", "violet", "amber", "rose", "cyan" (un colore coerente per ciascun ramo principale e i suoi figli).
5. Usa "edgeLabel" breve (1-3 parole) per descrivere il nesso logico tra genitore e figlio (es. "causa", "include", "esempio", "fase 1", "porta a").`;

      const mapUserPrompt = `ARGOMENTO DELLA MAPPA: "${focusTitle}"
MATERIA/CONTESTO: "${examDescription || 'Studio generale'}"
${sourceText ? `\nMATERIALE DI RIFERIMENTO:\n${sourceText.slice(0, 26000)}` : '\nGenera la mappa concettuale completa attingendo alle conoscenze accademiche consolidate.'}

Restituisci SOLO il JSON valido della mappa concettuale.`;

      const { text, modelUsed } = await generateAI({
        tier: 'light',
        systemPrompt: mapSystemPrompt,
        messages: [{ role: 'user', content: mapUserPrompt }],
        temperature: 0.25,
        maxTokens: 6000,
        jsonMode: true,
      });

      const parsed = safeParseJson(text, null);
      if (!parsed || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
        return jsonResponse({ error: 'Impossibile generare la mappa concettuale. Riprova.' }, 500);
      }

      // Normalizza nodi garantendo sempre un nodo root valido
      const nodes = parsed.nodes.map((n, idx) => ({
        id: String(n.id || `n_${idx}`),
        label: String(n.label || 'Concetto').slice(0, 80),
        summary: String(n.summary || '').slice(0, 400),
        level: Number.isFinite(Number(n.level)) ? Number(n.level) : idx === 0 ? 0 : 1,
        parentId: idx === 0 ? null : n.parentId ? String(n.parentId) : 'root',
        color: ['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan'].includes(n.color) ? n.color : 'blue',
        edgeLabel: n.edgeLabel ? String(n.edgeLabel).slice(0, 35) : '',
      }));

      await incrementUsage(profile, bucket);
      return jsonResponse({
        map: {
          id: `map_${Date.now()}`,
          title: parsed.title || focusTitle,
          layout: parsed.layout || mapStyle || 'tree',
          nodes,
          createdAt: new Date().toISOString(),
        },
        modelUsed,
      });
    }

    // -------------------------------------------------------------
    // AZIONE 3: GENERAZIONE VERIFICA COMPETENZE / QUIZ (GEMINI PRO)
    // -------------------------------------------------------------
    if (action === 'generate_quiz') {
      const targetCount = Math.max(3, Math.min(Number(numQuestions) || 10, 50));
      const types =
        Array.isArray(questionTypes) && questionTypes.length > 0
          ? questionTypes
          : ['scelta_multipla', 'completamento', 'accoppiamento', 'aperta'];

      const topics =
        Array.isArray(topicsList) && topicsList.length > 0 ? topicsList : ['Argomenti Generali'];

      const sourcesContext = extractRelevantChunks(
        allFiles,
        `${examDescription || ''} ${topics.join(' ')}`,
        28000
      );

      const quizSystemPrompt = `Sei un docente esperto (scuola superiore e università) ed empatico.
Il tuo compito è formulare una prova di verifica delle competenze composta da esattamente ${targetCount} domande.

TIPOLOGIE RICHIESTE: ${types.join(', ')}
LIVELLO DI DIFFICOLTÀ: ${difficulty || 'automatico'}
MATERIA: "${examDescription || 'Esame / Verifica'}"
ARGOMENTI DA COPRIRE: ${topics.join('; ')}

FORMATO DI RISPOSTA OBBLIGATORIO (JSON con chiave "questions"):
{
  "questions": [
    {
      "id": "q1",
      "type": "scelta_multipla" | "completamento" | "accoppiamento" | "aperta",
      "question": "Testo chiaro e specifico della domanda...",
      "options": ["Opzione A...", "Opzione B...", "Opzione C...", "Opzione D..."],
      "correctAnswer": "Risposta corretta",
      "alternativeAnswers": ["sinonimo 1", "variante 2"],
      "matchingPairs": [
        { "left": "Concetto 1", "right": "Definizione 1" },
        { "left": "Concetto 2", "right": "Definizione 2" },
        { "left": "Concetto 3", "right": "Definizione 3" }
      ],
      "idealAnswerCriteria": "Punti chiave che una risposta aperta deve argomentare",
      "explanation": "Spiegazione didattica chiara e incoraggiante",
      "topicTitle": "Titolo argomento specifico",
      "difficulty": "Facile" | "Intermedia" | "Difficile"
    }
  ]
}

REGOLE:
1. Per i completamenti, formula una frase dove manca un termine chiave preciso e includi sinonimi in "alternativeAnswers".
2. Distribuisci le domande equamente tra gli argomenti indicati.
3. Restituisci ESCLUSIVAMENTE JSON valido.`;

      const quizUserPrompt = `Genera la prova di verifica di ${targetCount} domande per gli argomenti:
${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}
${sourcesContext ? `\nFONTI DELLO STUDENTE:\n${sourcesContext}` : ''}`;

      const { text, modelUsed } = await generateAI({
        tier: targetCount >= 12 ? 'heavy' : 'light',
        systemPrompt: quizSystemPrompt,
        messages: [{ role: 'user', content: quizUserPrompt }],
        temperature: 0.3,
        maxTokens: 6000,
        jsonMode: true,
      });

      const parsed = safeParseJson(text, { questions: [] });
      const questions = Array.isArray(parsed?.questions)
        ? parsed.questions.map((q, idx) => ({ ...q, id: q.id || `q_${idx + 1}` }))
        : [];

      await incrementUsage(profile, bucket);
      return jsonResponse({ questions, modelUsed });
    }

    // -------------------------------------------------------------
    // AZIONE 4: VALUTAZIONE RISPOSTA APERTA IN TRENTESIMI (GEMINI PRO)
    // -------------------------------------------------------------
    if (action === 'evaluate_open_answer') {
      const evaluationSystemPrompt = `Sei un tutor accademico empatico, costruttivo e rigoroso.
Valuta la risposta aperta dello studente in trentesimi (0-30), valorizzando i concetti compresi e indicando con chiarezza cosa integrare.

SCALA DI VALUTAZIONE:
- 28-30: Risposta eccellente, completa e ben argomentata.
- 24-27: Molto buona (concetti chiave presenti, mancano solo dettagli secondari).
- 18-23: Sufficiente (concetti di base centrati, con alcune lacune).
- 10-17: Parziale (spunti corretti ma incompleta).
- 0-9: Non attinente o vuota.
- "isCorrect": true se score >= 18, altrimenti false.

FORMATO JSON OBBLIGATORIO:
{
  "score": 24,
  "maxScore": 30,
  "isCorrect": true,
  "feedback": "Spiegazione chiara e incoraggiante...",
  "strengths": ["Punti ben espressi"],
  "missedPoints": ["Aspetti da integrare"]
}`;

      const evaluationUserPrompt = `DOMANDA: "${question}"
ARGOMENTO: "${topicTitle || ''}"
CRITERI ATTESI: "${idealAnswerCriteria || ''}"

RISPOSTA DELLO STUDENTE:
"""
${studentAnswer || '[Nessuna risposta]'}
"""`;

      const { text, modelUsed } = await generateAI({
        tier: 'heavy',
        systemPrompt: evaluationSystemPrompt,
        messages: [{ role: 'user', content: evaluationUserPrompt }],
        temperature: 0.2,
        maxTokens: 1500,
        jsonMode: true,
      });

      const evaluationResult = safeParseJson(text, {
        score: 18,
        maxScore: 30,
        isCorrect: true,
        feedback: 'Valutazione completata.',
        strengths: [],
        missedPoints: [],
      });

      await incrementUsage(profile, bucket);
      return jsonResponse({ ...evaluationResult, modelUsed });
    }

    // -------------------------------------------------------------
    // AZIONE 5: RISCRITTURA RAPIDA SELEZIONE (GEMINI FLASH)
    // -------------------------------------------------------------
    if (action === 'rewrite_selection') {
      const textToRewrite = selectedText || '';
      if (!textToRewrite.trim()) {
        return jsonResponse({ error: 'Nessun testo selezionato da riscrivere.' }, 400);
      }

      let instruction =
        'Riscrivi questo testo in modo molto più chiaro, scorrevole, immediato e logico, preservando il rigore concettuale.';
      if (rewriteMode === 'riassumi') {
        instruction =
          'Riassumi e sintetizza in modo conciso e schematico questo passaggio, evidenziando i concetti chiave in grassetto (**termine**).';
      } else if (rewriteMode === 'approfondisci') {
        instruction =
          'Approfondisci questo passaggio fornendo dettagli rigorosi, spiegazioni dei meccanismi, terminologia specialistica ed eventuali formule LaTeX ($...$) o tabelle.';
      }

      const rewritePrompt = `${instruction}

TESTO SELEZIONATO:
"""
${textToRewrite}
"""
${fullContext ? `\nCONTESTO:\n${fullContext.slice(0, 3000)}` : ''}

Restituisci ESCLUSIVAMENTE il testo riscritto, senza premesse.`;

      const { text, modelUsed } = await generateAI({
        tier: rewriteMode === 'approfondisci' ? 'heavy' : 'light',
        systemPrompt: 'Sei un editor e docente esperto nel perfezionare testi di studio.',
        messages: [{ role: 'user', content: rewritePrompt }],
        temperature: 0.3,
        maxTokens: 2500,
      });

      await incrementUsage(profile, bucket);
      return jsonResponse({ rewrittenText: text || textToRewrite, modelUsed });
    }

    // -------------------------------------------------------------
    // AZIONE 6: CHATBOT DELLA LEZIONE CON MODIFICA DIRETTA (GEMINI FLASH)
    // -------------------------------------------------------------
    if (action === 'lesson_chat') {
      const currentLesson = lessonContent || '';
      const userQuestion = prompt || '';

      const lessonChatSystemPrompt = `Sei il Tutor dedicato a QUESTA SPECIFICA LEZIONE.
Hai accesso completo al testo attuale della lezione dello studente:

--- INIZIO TESTO LEZIONE ---
${currentLesson.slice(0, 45000)}
--- FINE TESTO LEZIONE ---

ISTRUZIONI:
1. Rispondi con tono chiaro, didattico e utile.
2. Se lo studente chiede di aggiungere, integrare, riscrivere, semplificare, correggere o rimuovere parti della lezione:
   - Applica la modifica direttamente su tutto il testo mantenendo formattazione Markdown, grassetti, elenchi, tabelle e formule LaTeX ($...$).
   - Imposta "hasUpdatedLesson": true e inserisci l'INTERO testo aggiornato in "updatedLessonContent".
3. Se fa solo una domanda di chiarimento, imposta "hasUpdatedLesson": false e "updatedLessonContent": null.

FORMATO JSON OBBLIGATORIO:
{
  "reply": "Risposta per la chat...",
  "hasUpdatedLesson": true | false,
  "updatedLessonContent": "Testo completo aggiornato oppure null"
}`;

      const messagesList = [];
      if (Array.isArray(lessonChatHistory)) {
        lessonChatHistory.forEach((m) => {
          if (m && typeof m.text === 'string') {
            messagesList.push({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.text,
            });
          }
        });
      }
      messagesList.push({ role: 'user', content: userQuestion });

      const { text, modelUsed } = await generateAI({
        tier: 'light',
        systemPrompt: lessonChatSystemPrompt,
        messages: messagesList,
        temperature: 0.3,
        maxTokens: 6000,
        jsonMode: true,
      });

      const parsed = safeParseJson(text, {
        reply: 'Risposta elaborata.',
        hasUpdatedLesson: false,
        updatedLessonContent: null,
      });

      await incrementUsage(profile, bucket);
      return jsonResponse({
        reply: parsed.reply || 'Informazione elaborata.',
        hasUpdatedLesson: Boolean(parsed.hasUpdatedLesson && parsed.updatedLessonContent),
        updatedLessonContent: parsed.updatedLessonContent || null,
        modelUsed,
      });
    }

    // -------------------------------------------------------------
    // AZIONE 7: GENERAZIONE SYLLABUS / PIANO DI STUDIO (GEMINI FLASH)
    // -------------------------------------------------------------
    if (action === 'generate_syllabus') {
      const numDays = Math.max(3, Math.min(daysTotal || 30, 60));
      const isOnlineSearch = sourceType === 'search_online';

      let perFileSummary = '';
      let validFilesCount = 0;

      if (!isOnlineSearch) {
        const TOTAL_CHAR_BUDGET = 80000;
        const budgetPerFile = Math.max(2500, Math.floor(TOTAL_CHAR_BUDGET / Math.max(1, allFiles.length)));

        allFiles.forEach((f, idx) => {
          const fileName = f.name || `Documento ${idx + 1}`;
          const rawText = (f.text || f.extractedText || '').trim();
          if (rawText && rawText.length > 5) {
            validFilesCount++;
            const digest = createSmartFileDigest(rawText, budgetPerFile);
            perFileSummary += `\n\n--- [FILE ${idx + 1} di ${allFiles.length}]: "${fileName}" ---\n${digest}\n--- [FINE FILE ${idx + 1}] ---\n`;
          }
        });

        if (validFilesCount === 0) {
          return jsonResponse(
            {
              error:
                'Nessun testo estratto dai documenti caricati. Assicurati che i file contengano testo selezionabile.',
            },
            400
          );
        }
      }

      const syllabusSystemPrompt = `Sei un pianificatore didattico esperto per scuole superiori e università.
Struttura un piano di studio completo, progressivo e bilanciato di esattamente ${numDays} giorni.

REGOLE:
${
  isOnlineSearch
    ? `1. Copri il programma completo della materia "${examDescription}" dai fondamenti ai concetti avanzati e ripasso finale.`
    : `1. Includi obbligatoriamente argomenti da TUTTI i ${validFilesCount} documenti caricati, basandoti esclusivamente sui contenuti forniti.`
}
2. Ogni giornata ("dayTitle") deve avere 1-3 argomenti specifici ("topics").
3. Restituisci ESCLUSIVAMENTE JSON valido:
{
  "schedule": [
    {
      "dayNumber": 1,
      "dayTitle": "Giorno 1: Titolo modulo",
      "phase": "Fase 1: Comprensione",
      "topics": [
        { "id": "d1_t1", "title": "Titolo argomento", "difficulty": "Fondamentale" }
      ]
    }
  ]
}`;

      const syllabusUserPrompt = `Materia: "${examDescription || 'Programma di Studio'}".
Giorni disponibili: ${numDays}.
Livello preparazione: ${prepLevel || 80}%.
Tipologia prova: ${payload.examType || 'orale'}.
Stile: ${languageStyle || 'automatico'}.
${isOnlineSearch ? 'Genera il programma completo.' : `DOCUMENTI:\n${perFileSummary}`}`;

      const { text, modelUsed } = await generateAI({
        tier: 'light',
        systemPrompt: syllabusSystemPrompt,
        messages: [{ role: 'user', content: syllabusUserPrompt }],
        temperature: 0.2,
        maxTokens: 5000,
        jsonMode: true,
      });

      let parsed = safeParseJson(text, {});
      if (parsed.schedule && Array.isArray(parsed.schedule)) parsed = parsed.schedule;
      else if (parsed.days && Array.isArray(parsed.days)) parsed = parsed.days;
      else if (!Array.isArray(parsed) && typeof parsed === 'object') {
        const arr = Object.values(parsed).find((v) => Array.isArray(v));
        if (arr) parsed = arr;
      }

      await incrementUsage(profile, bucket);
      return jsonResponse({
        schedule: Array.isArray(parsed) && parsed.length > 0 ? parsed : null,
        filesCovered: validFilesCount,
        modelUsed,
      });
    }

    // -------------------------------------------------------------
    // AZIONE 8: GENERAZIONE LEZIONE / COMPENDIO APPROFONDITO (GEMINI PRO + STREAMING SSE)
    // -------------------------------------------------------------
    if (isLessonGeneration || action === 'generate_lesson') {
      const isStrict = sourceType === 'my_materials';
      const availableImagesList = [];
      allFiles.forEach((f, idx) => {
        if (Array.isArray(f.images) && f.images.length > 0) {
          f.images.forEach((img) => {
            availableImagesList.push({
              id: img.id,
              name: img.name || img.label || `Figura ${availableImagesList.length + 1}`,
              fileName: f.name || `File ${idx + 1}`,
            });
          });
        }
      });

      const relevantSources = extractRelevantChunks(
        allFiles,
        `${topicTitle || ''} ${examDescription || ''}`,
        120000
      );

      const prepTarget = Number(prepLevel) || 85;
      const depthInstruction =
        prepTarget >= 90
          ? 'LIVELLO MASSIMO (90-100% / 30 e Lode): trattazione enciclopedica definitiva, zero tagli, copri OGNI minimo sottocapitolo, classificazione, meccanismo molecolare/teorico, eccezione, valore numerico, confronto e caso pratico.'
          : prepTarget >= 75
            ? 'LIVELLO ALTO (75-89%): trattazione completa e approfondita con tutti i concetti chiave, meccanismi, tabelle comparative, formule ed esempi.'
            : 'LIVELLO SOLIDO (fino a 74%): trattazione chiara, completa e lineare focalizzata sui pilastri fondamentali ben spiegati senza banalizzazioni.';

      const lessonSystemPrompt = `Sei un professore universitario ordinario e autore di manuali didattici d'eccellenza.
Il tuo obiettivo è scrivere una **LEZIONE DEFINITIVA DI ALTISSIMA DENSITÀ DIDATTICA** sull'argomento richiesto per la materia "${examDescription || 'Studio'}", superiore per rigore, profondità e chiarezza ai migliori manuali universitari.

${depthInstruction}

REGOLE FERREE DI QUALITÀ (STILE EDITORIALE D'ELITE):
1. **ZERO FUFFA E ZERO INDICI RIDONDANTI**:
   - **NON inserire l'Indice Analitico** (spreca spazio e ripete i titoli). Parti SUBITO con il Capitolo 1 (## 1. ...).
   - **VIETATI capitoli riempitivi generici** (come "Implicazioni nella ricerca", "Conclusioni generali", "Importanza clinica generica"). Ogni singolo paragrafo deve contenere nozioni ad alta resa d'esame.
2. **ESTRAZIONE FORENSE DALLE DISPENSE DEL DOCENTE (PRIORITÀ ASSOLUTA)**:
   - Se sono presenti documenti caricati dallo studente, DEVI estrarre, citare esplicitamente e spiegare a fondo **OGNI singolo dettaglio specifico delle dispense**: nomi di autori/professori, studi citati (con rivista, anno, campione, percentuali), geni/loci cromosomici, biomarcatori, segni clinici eponimi, sottoclassi complete (es. C0s, C2r, C4a, C4b, C4c, C6r), calibri/cut-off numerici, meccanismi molecolari e classificazioni aggiornate.
   - Non sostituire mai i dettagli specifici delle dispense con generalizzazioni scolastiche!
3. **REGOLA ANTI-COMPRESSIONE (SPIEGAZIONE DISCORSIVA COMPLETA IN OGNI SOTTOCAPITOLO)**:
   - **VIETATO comprimere o riassumere la seconda metà della lezione!** Ogni singolo sottocapitolo (###) DEVE avere almeno **2–3 paragrafi discorsivi completi (120–180+ parole ciascuno)**, mai 2–4 righe telegrafiche.
   - **NON limitarti a nominare** una manovra, un segno, una tecnica o uno studio: **spiega sempre il COME e il PERCHÉ** (es. come si esegue passo passo una manovra semeiologica o ecografica, cosa corrisponde anatomicamente a un segno clinico/ecografico, come agisce una classe farmacologica o una procedura, e quali sono i numeri/percentuali/campioni/risultati esatti di ogni studio citato nelle dispense).
   - Spiega ogni processo causale passo dopo passo (cascate fisiopatologiche, dimostrazioni, nessi storici/giuridici/tecnici) con elenchi numerati argomentati e prosa chiara da manuale universitario.
4. **FORMATTING RICCO E SCANSIONABILE**:
   - Usa grassetti selettivi solo sui termini tecnici chiave (**termine**).
   - Inserisci **almeno 1–2 TABELLE MARKDOWN** dettagliate per classificazioni, sottoclassi o confronti.
   - Usa **LaTeX** ($...$ / $$...$$) per qualsiasi formula, unità o parametro matematico/scientifico.
   - Inserisci **2–3 box callout** di valore reale (es. un caso/studio citato nelle dispense e una regola d'esame):
     > **Esempio / Studio di Riferimento:** [Dettagli concreti dalle dispense o dalla letteratura]
     > **Attenzione / Distinzione Chiave d'Esame:** [Errore tipico da evitare]
5. **IMMAGINI REALI DAI DOCUMENTI**:
${
  availableImagesList.length > 0
    ? `Sono disponibili queste ${availableImagesList.length} immagini/slide REALI estratte dai documenti dello studente:
${availableImagesList
  .map((img) => `- ID ESATTO: "${img.id}" -> ${img.name} (${img.fileName})`)
  .join('\n')}
Inserisci nei capitoli pertinenti almeno 2–5 di queste figure reali usando ESATTAMENTE questa sintassi su una riga dedicata (senza backtick), sostituendo il testo tra parentesi quadre con la didascalia reale della figura:
![Stadio CEAP C1-C2 / Eco-Color-Doppler / nome reale della figura](ID_ESATTO)`
    : 'Non inventare URL di immagini esterne; usa tabelle Markdown ricche per schematizzare.'
}
6. **CHIUSURA INTERATTIVA (AUTO-VERIFICA RAPIDA)**:
   - Chiudi la lezione con una breve sezione "## Verifica Rapida (Vero o Falso)" con **3 affermazioni trabocchetto d'esame** basate sui dettagli più fini delle dispense (con risposta corretta e spiegazione in 1 riga).`;

      const lessonUserPrompt = `MATERIA: "${examDescription || 'Trattazione di Studio'}"
ARGOMENTO SPECIFICO: "${topicTitle}"
LIVELLO TARGET: ${prepTarget}%
STILE: ${languageStyle || 'automatico'}
${
  relevantSources
    ? `\nFONTI INTEGRALI / ESTRATTI DEL DOCENTE (USA OGNI DETTAGLIO SPECIFICO PRESENTE QUI):\n${relevantSources}`
    : '\n(Nessun file allegato: sviluppa la trattazione al massimo livello universitario citando classificazioni aggiornate, cut-off numerici, meccanismi molecolari/teorici e criteri ufficiali).'
}

Redigi ora la lezione definitiva partendo direttamente dal Capitolo 1 (senza indice).`;

      if (stream) {
        return await streamAIResponse({
          tier: 'heavy',
          systemPrompt: lessonSystemPrompt,
          messages: [{ role: 'user', content: lessonUserPrompt }],
          temperature: 0.25,
          maxTokens: 16384,
          onComplete: () => incrementUsage(profile, bucket),
        });
      }

      const { text, modelUsed } = await generateAI({
        tier: 'heavy',
        systemPrompt: lessonSystemPrompt,
        messages: [{ role: 'user', content: lessonUserPrompt }],
        temperature: 0.25,
        maxTokens: 16384,
      });

      await incrementUsage(profile, bucket);
      return jsonResponse({ reply: text || 'Nessuna lezione generata.', modelUsed });
    }

    // -------------------------------------------------------------
    // AZIONE 9: CHAT HOMEPAGE MULTI-FILE (GEMINI FLASH + STREAMING SSE)
    // -------------------------------------------------------------
    const imageParts = [];
    const textFiles = [];

    allFiles.slice(0, 10).forEach((f) => {
      const mime = (f.mimeType || '').toLowerCase();
      const base64 = f.base64 || '';
      if (mime.startsWith('image/') && base64) {
        imageParts.push({
          type: 'image_url',
          image_url: {
            url: base64.startsWith('data:') ? base64 : `data:${mime};base64,${base64}`,
          },
        });
      } else {
        textFiles.push(f);
      }
    });

    const userPrompt = prompt || '';
    const chatSourcesText = extractRelevantChunks(textFiles, userPrompt, 30000);

    const standardSystemInstruction = `Sei MinervaAI, un tutor intelligente per studenti delle scuole superiori e dell'università.
Rispondi in modo chiaro, logico e pedagogico in formato Markdown con termini chiave in grassetto, tabelle quando utili ed equazioni LaTeX in $ o $$. Se l'utente allega file o immagini, analizzali con precisione.`;

    let finalPromptText = userPrompt || 'Analizza questi materiali di studio.';
    if (chatSourcesText) {
      finalPromptText += `\n\n=== ESTRATTI RILEVANTI DAI DOCUMENTI ALLEGATI ===${chatSourcesText}`;
    }

    const messages = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const msg of history.slice(-14)) {
        if (!msg || typeof msg.text !== 'string') continue;
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text,
        });
      }
    }

    if (imageParts.length > 0) {
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: finalPromptText }, ...imageParts],
      });
    } else {
      messages.push({
        role: 'user',
        content: finalPromptText,
      });
    }

    if (stream) {
      return await streamAIResponse({
        tier: 'light',
        systemPrompt: standardSystemInstruction,
        messages,
        temperature: 0.45,
        maxTokens: 4096,
        onComplete: () => incrementUsage(profile, bucket),
      });
    }

    const { text, modelUsed } = await generateAI({
      tier: 'light',
      systemPrompt: standardSystemInstruction,
      messages,
      temperature: 0.45,
      maxTokens: 4096,
    });

    await incrementUsage(profile, bucket);
    return jsonResponse({ reply: text || 'Nessuna risposta generata.', modelUsed });
  } catch (error) {
    console.error('Errore backend chat.js:', error);
    return jsonResponse({ error: error.message || 'Errore durante la generazione AI.' }, 500);
  }
};
