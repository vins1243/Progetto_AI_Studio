// Netlify Function v2 - Endpoint AI unificato con Auth JWT, Quote Freemium/Pro,
// Routing Gemini Flash (leggero) / Gemini Pro (pesante), Chunking intelligente e Streaming SSE.

import {
  verifySupabaseUser,
  getOrCreateProfile,
  getDeviceHash,
  getOrCreateDeviceFreeUsage,
  getQuotaBucketForAction,
  checkQuota,
  incrementUsage,
} from './_lib/authAndQuota.js';
import {
  generateAI,
  streamAIResponse,
  streamAIToWriter,
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
    otherLessonTopics,
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
    // 2. Carica profilo + fingerprint dispositivo (anti-multi-account Free) e verifica quote
    const profile = await getOrCreateProfile(auth.user);
    const deviceHash = getDeviceHash(req);
    const deviceUsage = await getOrCreateDeviceFreeUsage(deviceHash, auth.user.id);

    if (action === 'get_usage') {
      const status = checkQuota(profile, null, deviceUsage);
      return jsonResponse({
        pro: status.pro,
        tier: status.tier,
        usage: status.usage,
        limits: status.limits,
        planType: status.tier || profile.plan_type || 'free',
        subscriptionStatus: profile.subscription_status || (status.pro ? 'active' : 'free'),
      });
    }

    const bucket = getQuotaBucketForAction(action, isLessonGeneration);
    const quota = checkQuota(profile, bucket, deviceUsage);
    if (!quota.allowed) {
      return jsonResponse(
        {
          error: quota.error,
          code: 'QUOTA_EXCEEDED',
          bucket: quota.bucket,
          pro: quota.pro,
          tier: quota.tier,
          usage: quota.usage,
          limits: quota.limits,
        },
        402
      );
    }

    const recordUsage = () => incrementUsage(profile, bucket, deviceUsage);

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

      const mapSystemPrompt = `Sei un esperto di didattica visuale e mappe mentali bilaterali (stile Algor Education / XMind) per studenti delle scuole superiori e dell'universita.
Crea una mappa mentale gerarchica a 4 LIVELLI, ricca, completa e visivamente bilanciata (meta rami a sinistra, meta a destra del concetto centrale).

REGOLE DI STRUTTURA JSON OBBLIGATORIE:
Restituisci ESCLUSIVAMENTE un JSON valido con questa struttura esatta:
{
  "title": "Titolo sintetico della mappa",
  "layout": "mindmap",
  "nodes": [
    {
      "id": "root",
      "label": "TITOLO CENTRALE DELLA MAPPA (max 6-8 parole)",
      "summary": "Sintesi generale dell'argomento",
      "level": 0,
      "parentId": null,
      "color": "crimson"
    },
    {
      "id": "b1",
      "label": "PRIMO RAMO PRINCIPALE (max 5 parole)",
      "summary": "Tema del primo grande pilastro",
      "level": 1,
      "parentId": "root",
      "color": "crimson"
    },
    {
      "id": "b1_1",
      "label": "Sottocategoria 1.1 (max 4 parole)",
      "summary": "Sottotema specifico",
      "level": 2,
      "parentId": "b1",
      "color": "crimson"
    },
    {
      "id": "b1_1_1",
      "label": "Frase completa, chiara e autonoma che spiega il concetto chiave, meccanismo, classificazione o valore clinico/tecnico (15-26 parole).",
      "summary": "",
      "level": 3,
      "parentId": "b1_1",
      "color": "crimson"
    }
  ]
}

VINCOLI DIDATTICI TASSATIVI:
1. STRUTTURA A 4 LIVELLI (28-40 nodi totali):
   - level 0: 1 solo nodo centrale ("id": "root", "parentId": null).
   - level 1: ESATTAMENTE 4 rami principali (oppure 6 se l'argomento e molto vasto) collegati a "root".
   - level 2: 2-3 sottocategorie per ciascun ramo principale (etichette brevi di 2-5 parole, es. "I PILASTRI DELLE 4 P", "COMPARTIMENTI VASCOLARI").
   - level 3: 2-3 schede foglia per ciascuna sottocategoria. Ogni nodo di level 3 DEVE contenere nel campo "label" una frase didattica completa, precisa e memorizzabile (15-26 parole, es. "Il sistema arterioso trasporta sangue ossigenato dal cuore ai tessuti periferici operando ad alta pressione in senso centrifugo.").
2. COERENZA COLORI PER RAMO: assegna un colore DIVERSO a ciascun ramo di level 1 scegliendo in ordine da: "crimson", "orange", "emerald", "violet", "teal", "blue". Tutti i figli di level 2 e level 3 DEVONO ereditare lo stesso "color" del proprio ramo di level 1.
3. Ogni nodo figlio DEVE avere "parentId" uguale all'"id" di un nodo genitore esistente.
4. NON usare elenchi puntati o markdown dentro "label": solo testo pulito in italiano accademico.`;

      const mapUserPrompt = `ARGOMENTO DELLA MAPPA: "${focusTitle}"
MATERIA/CONTESTO: "${examDescription || 'Studio generale'}"
${sourceText ? `\nMATERIALE DI RIFERIMENTO:\n${sourceText.slice(0, 28000)}` : '\nGenera la mappa mentale completa a 4 livelli attingendo alle conoscenze accademiche consolidate.'}

Restituisci SOLO il JSON valido della mappa mentale a 4 livelli.`;

      const { text, modelUsed } = await generateAI({
        tier: 'light',
        systemPrompt: mapSystemPrompt,
        messages: [{ role: 'user', content: mapUserPrompt }],
        temperature: 0.25,
        maxTokens: 8192,
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

      await recordUsage();
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

      await recordUsage();
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

      await recordUsage();
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

      await recordUsage();
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

      await recordUsage();
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

      await recordUsage();
      return jsonResponse({
        schedule: Array.isArray(parsed) && parsed.length > 0 ? parsed : null,
        filesCovered: validFilesCount,
        modelUsed,
      });
    }

    // -------------------------------------------------------------
    // AZIONE 8: GENERAZIONE LEZIONE MULTI-AGENTE (ADMIN + TEAMWORK 3 LEZIONI + MACRO-AGENTE)
    // -------------------------------------------------------------
    if (isLessonGeneration || action === 'generate_lesson') {
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

      // Confini rigorosi del syllabus: elenco di tutte le ALTRE lezioni del corso per evitare ripetizioni
      const otherTopicsClean = Array.isArray(otherLessonTopics)
        ? otherLessonTopics.filter(Boolean).slice(0, 60)
        : [];
      const syllabusBoundaryBlock =
        otherTopicsClean.length > 0
          ? `\nCONFINI TASSATIVI DEL SYLLABUS (ZERO RIPETIZIONI TRA LEZIONI):
Questa lezione fa parte di un piano di studio strutturato e DEVE trattare ESCLUSIVAMENTE "${topicTitle}".
Le seguenti ALTRE lezioni esistono gia separatamente nel piano di studio:
${otherTopicsClean.map((t) => `- ${t}`).join('\n')}
REGOLA DI NON-SOVRAPPOSIZIONE:
- NON ripetere, NON rubare e NON rispiegare in profondita argomenti che appartengono chiaramente a una delle altre lezioni elencate sopra.
- Se un concetto di un'altra lezione serve solo come raccordo logico, citalo in massimo 1 riga (es. "come approfondito nella lezione dedicata a ...") e investi il 100% dello spazio su "${topicTitle}".`
          : '';

      const imagesRuleBlock =
        availableImagesList.length > 0
          ? `Sono disponibili queste ${availableImagesList.length} immagini REALI ritagliate dai documenti dello studente:
${availableImagesList
  .map((img) => `- ID: "${img.id}" -> ${img.name} (${img.fileName})`)
  .join('\n')}
Inserisci nei punti pertinenti 2-5 di queste immagini usando ESATTAMENTE questa sintassi su una riga dedicata:
![Scrivi una didascalia clinica breve e precisa](ID_ESATTO)
Regola didascalia: scrivi solo il titolo clinico pulito tra parentesi quadre (mai barre o segnaposto).`
          : 'Usa tabelle Markdown dettagliate per schematizzare i concetti chiave.';

      const coreDidacticRules = `${depthInstruction}
${syllabusBoundaryBlock}

REGOLE INDEROGABILI DI QUALITA E COMPLETEZZA:
1. FOCUS ASSOLUTO SU "${topicTitle}": parti subito con "## 1. ..." (NON inserire Indice Analitico e NON scrivere frasi conclusive vuote).
2. ESTRAZIONE FORENSE TOTALE DALLE DISPENSE DEL DOCENTE: riporta OGNI singolo dettaglio presente nei documenti caricati relativo a "${topicTitle}" (nomi di autori/studi, anno, campione N, percentuali, geni/loci, meccanismi molecolari, segni clinici/ecografici eponimi, prove semeiologiche passo passo con tempi e criteri di positivita, TUTTE le classi/sottoclassi e i cut-off numerici).
3. REGOLA ANTI-COMPRESSIONE (MINIMO 1.800-3.000 PAROLE): VIETATO fare paragrafi riassuntivi da 3-4 righe! Ogni sezione (## e ###) DEVE contenere spiegazioni estese, discorsive, meccanismi passo-passo e correlazioni pratiche/cliniche.
4. ELEMENTI OBBLIGATORI:
   - Almeno 1-2 TABELLE MARKDOWN COMPLETE E DETTAGLIATE.
   - Almeno 2 BOX CALLOUT (> **Esempio / Studio di Riferimento:** ... e > **Attenzione / Distinzione Chiave d'Esame:** ...).
   - Formule LaTeX ($...$ / $$...$$) quando pertinenti.
5. IMMAGINI REALI DAI DOCUMENTI:
${imagesRuleBlock}
6. CHIUSURA CON VERIFICA RAPIDA: chiudi con "## Verifica Rapida (Vero o Falso)" contenente 3 affermazioni trabocchetto d'esame (ciascuna numerata con risposta **Vero** o **Falso**: spiegazione concisa).`;

      // Helper per eseguire la pipeline Admin -> 3 Sotto-Agenti in parallelo -> Macro-Agente
      const runMultiAgentPipeline = async (emitStatus) => {
        // FASE 1: ADMIN PLANNER (analizza syllabus, divide il testo in parti esatte e definisce i confini)
        emitStatus(1, 'Admin AI: analisi del syllabus, esclusione argomenti di altre lezioni e divisione in sezioni...');

        const adminSystemPrompt = `Sei l'ADMIN DIDATTICO di MinervaAI. Il tuo compito e pianificare la scaletta esatta della lezione "${topicTitle}" (materia: "${examDescription || 'Studio'}") affinche i sotto-agenti la sviluppino in modo chirurgico, completo e SENZA ripetere argomenti delle altre lezioni del corso.

Restituisci ESCLUSIVAMENTE un JSON valido:
{
  "sections": [
    {
      "number": 1,
      "title": "Titolo preciso della sezione",
      "mustInclude": ["dettaglio specifico 1 dalle fonti", "classificazione/tabella/valore numerico/manovra 2"]
    }
  ],
  "outOfScope": ["argomenti di altre lezioni da NON trattare qui"],
  "requiredTables": ["descrizione tabella 1 da includere"]
}

Scegli il numero ideale di sezioni (da 4 a 7 parti) in base alla densita reale dell'argomento "${topicTitle}" nelle fonti.`;

        const adminUserPrompt = `ARGOMENTO TARGET: "${topicTitle}"
MATERIA: "${examDescription || 'Studio'}"
${syllabusBoundaryBlock}
${relevantSources ? `\nFONTI DEL DOCENTE (estratto per pianificazione):\n${relevantSources.slice(0, 45000)}` : '\nNessun file allegato: pianifica in base allo standard universitario avanzato.'}`;

        let blueprintText = '';
        try {
          const adminRes = await generateAI({
            tier: 'light',
            systemPrompt: adminSystemPrompt,
            messages: [{ role: 'user', content: adminUserPrompt }],
            temperature: 0.2,
            maxTokens: 2048,
            jsonMode: true,
          });
          const bp = safeParseJson(adminRes.text, null);
          if (bp && Array.isArray(bp.sections) && bp.sections.length > 0) {
            blueprintText = `PIANO SEZIONI DEFINITO DALL'ADMIN (${bp.sections.length} PARTI OBBLIGATORIE):
${bp.sections
  .map(
    (s, i) =>
      `${i + 1}. ## ${s.number || i + 1}. ${s.title}${
        Array.isArray(s.mustInclude) && s.mustInclude.length > 0
          ? `\n   Elementi obbligatori da sviluppare a fondo: ${s.mustInclude.join('; ')}`
          : ''
      }`
  )
  .join('\n')}
${
  Array.isArray(bp.requiredTables) && bp.requiredTables.length > 0
    ? `\nTABELLE OBBLIGATORIE: ${bp.requiredTables.join(' | ')}`
    : ''
}
${
  Array.isArray(bp.outOfScope) && bp.outOfScope.length > 0
    ? `\nFUORI PERIMETRO (NON TRATTARE QUI, APPARTIENE AD ALTRE LEZIONI): ${bp.outOfScope.join('; ')}`
    : ''
}`;
          }
        } catch (err) {
          console.warn('Admin Planner fallback:', err.message);
        }

        // FASE 2: TEAMWORK — 3 SOTTO-AGENTI IN PARALLELO GENERANO 3 LEZIONI COMPLETE INDIPENDENTI
        emitStatus(2, 'Teamwork AI: 3 sotto-agenti stanno sviluppando 3 versioni complete della lezione in parallelo...');

        const subAgentProfiles = [
          {
            id: 1,
            name: 'Agente Forense & Classificazioni',
            focus:
              'Massima fedelta forense alle fonti: non perdere NEMMENO UN numero, cut-off, percentuale, studio clinico/autore, gene/locus, sottoclasse o tabella comparativa.',
            temp: 0.25,
          },
          {
            id: 2,
            name: 'Agente Fisiopatologo & Operativo',
            focus:
              'Massima profondita esplicativa e discorsiva: spiega ogni meccanismo causa-effetto passo dopo passo, il razionale teorico/clinico, come si esegue e si interpreta ogni prova/manovra/procedura, con box callout d esame potentissimi.',
            temp: 0.35,
          },
          {
            id: 3,
            name: 'Agente Esaminatore & Schemi',
            focus:
              'Massima chiarezza strutturale e resa d esame: definizioni cristalline, distinzioni critiche tra concetti confondibili, posizionamento perfetto delle immagini ![didascalia](ID), formule LaTeX e 3 domande Vero/Falso davvero selettive.',
            temp: 0.3,
          },
        ];

        let completedDrafts = 0;
        const draftPromises = subAgentProfiles.map(async (agent) => {
          const subSys = `Sei il Sotto-Agente #${agent.id} (${agent.name}) del team MinervaAI.
LA TUA SPECIALIZZAZIONE: ${agent.focus}

${coreDidacticRules}`;

          const subUser = `MATERIA: "${examDescription || 'Studio'}"
ARGOMENTO ESCLUSIVO: "${topicTitle}"
LIVELLO TARGET: ${prepTarget}%

${blueprintText || 'Struttura la lezione in 4-6 sezioni numerate (## 1., ## 2., ...) focalizzate esclusivamente su questo argomento.'}

${
  relevantSources
    ? `FONTI DEL DOCENTE:\n${relevantSources}`
    : '(Nessun file allegato: usa conoscenze universitarie approfondite e rigorose.)'
}

Redigi la TUA versione completa della lezione (minimo 1.800 parole, zero riassunti brevi, rispetta rigorosamente i confini del syllabus).`;

          const res = await generateAI({
            tier: 'light',
            systemPrompt: subSys,
            messages: [{ role: 'user', content: subUser }],
            temperature: agent.temp,
            maxTokens: 10000,
          });
          completedDrafts += 1;
          emitStatus(
            2,
            `Teamwork AI: completate ${completedDrafts}/3 lezioni candidate dai sotto-agenti...`
          );
          return { agent: agent.name, text: res.text || '' };
        });

        const settled = await Promise.allSettled(draftPromises);
        const validDrafts = settled
          .filter((r) => r.status === 'fulfilled' && r.value?.text && r.value.text.length > 300)
          .map((r) => r.value);

        // FASE 3: MACRO-AGENTE SYNTHESIZER (confronta le 3 lezioni e fonde il meglio nella lezione definitiva)
        emitStatus(
          3,
          `Macro-Agente AI: confronto delle ${validDrafts.length} lezioni generate e sintesi della versione definitiva...`
        );

        const macroSystemPrompt = `Sei il MACRO-AGENTE REDATTORE CAPO di MinervaAI (professore universitario ordinario).
Hai ricevuto ${validDrafts.length} versioni complete e indipendenti della lezione "${topicTitle}" prodotte in parallelo da 3 sotto-agenti specializzati.

IL TUO COMPITO SUPREMO:
1. CONFRONTA attentamente tutte le versioni sezione per sezione.
2. FONDI IL MEGLIO DI TUTTE E 3 in UNA SOLA LEZIONE DEFINITIVA, COESA E MONUMENTALE:
   - Prendi TUTTI i numeri, cut-off, classificazioni complete, sottoclassi, studi, autori, geni e tabelle piu ricche tra le 3 bozze (se un dettaglio importante compare anche in una sola bozza, INCLUDILO!).
   - Prendi le spiegazioni fisiopatologiche/meccanicistiche e operative piu chiare, estese e scorrevoli (ZERO compressione, minimo 2.000-3.200 parole).
   - Mantieni le migliori tabelle Markdown, almeno 2 box callout (> **...**), le formule LaTeX corrette e i tag immagine ![didascalia](ID) piu pertinenti.
   - Seleziona o perfeziona le 3 migliori domande per "## Verifica Rapida (Vero o Falso)".
3. CONTROLLO CONFINI SYLLABUS: verifica che la lezione finale tratti ESCLUSIVAMENTE "${topicTitle}" e NON ripeta argomenti che spettano alle altre lezioni del piano di studio.
4. STILE FINALE: restituisci SOLO la lezione finale pulita in Markdown partendo subito da "## 1. ..." (NON scrivere mai commenti del tipo "Ho confrontato le 3 bozze..." o meta-spiegazioni).

${coreDidacticRules}`;

        const macroUserPrompt =
          validDrafts.length > 0
            ? `MATERIA: "${examDescription || 'Studio'}"
ARGOMENTO ESCLUSIVO: "${topicTitle}"
${blueprintText ? `\n${blueprintText}\n` : ''}
${validDrafts
  .map(
    (d, i) =>
      `\n==================== LEZIONE CANDIDATA ${i + 1} (${d.agent}) ====================\n${d.text.slice(0, 26000)}`
  )
  .join('\n')}

Ora confronta le ${validDrafts.length} lezioni candidate e scrivi la LEZIONE DEFINITIVA SUPERIORE che integra ogni singolo punto di forza di tutte le versioni, senza ripetere argomenti di altre lezioni del syllabus.`
            : `MATERIA: "${examDescription || 'Studio'}"
ARGOMENTO ESCLUSIVO: "${topicTitle}"
${blueprintText ? `\n${blueprintText}\n` : ''}
${relevantSources ? `\nFONTI DEL DOCENTE:\n${relevantSources}` : ''}
Scrivi la lezione definitiva completa al massimo livello universitario.`;

        return { macroSystemPrompt, macroUserPrompt };
      };

      if (stream) {
        const encoder = new TextEncoder();
        const sseStream = new ReadableStream({
          async start(controller) {
            const sendEvent = (evt) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
            };

            try {
              const { macroSystemPrompt, macroUserPrompt } = await runMultiAgentPipeline((stage, text) => {
                sendEvent({ type: 'status', stage, text });
              });

              const { modelUsed, provider } = await streamAIToWriter({
                tier: 'heavy',
                systemPrompt: macroSystemPrompt,
                messages: [{ role: 'user', content: macroUserPrompt }],
                temperature: 0.3,
                maxTokens: 16384,
                sendEvent,
              });

              await recordUsage();
              sendEvent({ type: 'done', modelUsed, provider });
            } catch (err) {
              sendEvent({ type: 'error', error: err.message || 'Errore nella generazione multi-agente.' });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(sseStream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        });
      }

      const { macroSystemPrompt, macroUserPrompt } = await runMultiAgentPipeline(() => {});
      const { text, modelUsed } = await generateAI({
        tier: 'heavy',
        systemPrompt: macroSystemPrompt,
        messages: [{ role: 'user', content: macroUserPrompt }],
        temperature: 0.3,
        maxTokens: 16384,
      });

      await recordUsage();
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
        onComplete: () => recordUsage(),
      });
    }

    const { text, modelUsed } = await generateAI({
      tier: 'light',
      systemPrompt: standardSystemInstruction,
      messages,
      temperature: 0.45,
      maxTokens: 4096,
    });

    await recordUsage();
    return jsonResponse({ reply: text || 'Nessuna risposta generata.', modelUsed });
  } catch (error) {
    console.error('Errore backend chat.js:', error);
    return jsonResponse({ error: error.message || 'Errore durante la generazione AI.' }, 500);
  }
};
