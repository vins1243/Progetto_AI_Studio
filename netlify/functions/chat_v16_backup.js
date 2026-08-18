import OpenAI, { toFile } from 'openai';

// Helper per compattare i documenti ed evitare sforamenti di quota
function createSmartFileDigest(rawText, maxChars) {
  if (!rawText) return '';
  const clean = rawText.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;

  const headBudget = Math.floor(maxChars * 0.7);
  const tailBudget = Math.floor(maxChars * 0.3);
  const head = clean.slice(0, headBudget);
  const tail = clean.slice(-tailBudget);
  return `${head}\n[... SEZIONI INTERMEDIE ...]\n${tail}`;
}

// Chiamata sicura con fallback automatico su gpt-4o-mini
async function callOpenAIWithFallback(openai, primaryModel, params) {
  const modelsToTry = [primaryModel];
  if (primaryModel !== 'gpt-4o-mini') {
    modelsToTry.push('gpt-4o-mini');
  }

  let lastError = null;
  for (const modelName of modelsToTry) {
    try {
      const response = await openai.chat.completions.create({
        ...params,
        model: modelName,
      });
      return { response, modelUsed: modelName };
    } catch (err) {
      console.warn(`Tentativo con ${modelName} fallito (${err.status || err.message}), fallback...`);
      lastError = err;
    }
  }
  throw lastError;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const payload = JSON.parse(event.body);
    const { 
      action,
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
      // Parametri per riscrittura selezione
      selectedText,
      rewriteMode,
      fullContext,
      // Parametri per chatbot dedicato con modifica diretta
      lessonContent,
      lessonChatHistory,
      // Parametri per generazione quiz / verifica competenze
      topicsList,
      questionTypes,
      numQuestions,
      difficulty,
      // Parametri per valutazione risposte aperte
      question,
      idealAnswerCriteria,
      studentAnswer,
      lessonContext,
      // Parametri per trascrizione vocale con OpenAI Whisper
      audioBase64,
      audioMimeType
    } = payload;

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Chiave OPENAI_API_KEY non configurata su Netlify.' }),
      };
    }

    const openai = new OpenAI({ apiKey });
    const allFiles = Array.isArray(files) ? files : (file ? [file] : []);

    // -------------------------------------------------------------
    // AZIONE 1: TRASCRIZIONE VOCALE AVANZATA CON OPENAI WHISPER
    // -------------------------------------------------------------
    if (action === 'transcribe_audio') {
      if (!audioBase64) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Nessun file audio ricevuto.' }),
        };
      }

      try {
        const rawBase64 = audioBase64.includes('base64,') 
          ? audioBase64.split('base64,')[1] 
          : audioBase64;
        const buffer = Buffer.from(rawBase64, 'base64');
        const mime = audioMimeType || 'audio/webm';
        
        let audioFileObj;
        if (typeof toFile === 'function') {
          audioFileObj = await toFile(buffer, 'audio.webm', { type: mime });
        } else if (OpenAI.toFile) {
          audioFileObj = await OpenAI.toFile(buffer, 'audio.webm', { type: mime });
        } else {
          // Fallback con buffer nominato
          audioFileObj = {
            buffer,
            name: 'audio.webm',
            type: mime
          };
        }

        const transcription = await openai.audio.transcriptions.create({
          file: audioFileObj,
          model: 'whisper-1',
          language: 'it',
          temperature: 0.2
        });

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: transcription.text || '' }),
        };
      } catch (err) {
        console.error("Errore trascrizione Whisper:", err);
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Errore nella dettatura vocale Whisper: ${err.message}` }),
        };
      }
    }

    // -------------------------------------------------------------
    // AZIONE 2: GENERAZIONE VERIFICA COMPETENZE (QUIZ MULTI-TIPOLOGIA)
    // -------------------------------------------------------------
    if (action === 'generate_quiz') {
      const targetCount = Math.max(3, Math.min(Number(numQuestions) || 10, 80));
      const types = Array.isArray(questionTypes) && questionTypes.length > 0 
        ? questionTypes 
        : ['scelta_multipla', 'completamento', 'accoppiamento', 'aperta'];
      
      const topics = Array.isArray(topicsList) && topicsList.length > 0
        ? topicsList
        : ['Argomenti Generali'];

      let sourcesContext = '';
      allFiles.forEach((f, idx) => {
        const text = (f.text || f.extractedText || '').trim();
        if (text) {
          sourcesContext += `\n[Doc ${idx + 1}: ${f.name}]: ${text.slice(0, 8000)}\n`;
        }
      });

      const quizSystemPrompt = `Sei un professore universitario e tutor accademico esperto ed empatico.
Il tuo compito è formulare una prova di verifica delle competenze composta da esattamente ${targetCount} domande.

TIPOLOGIE RICHIESTE: ${types.join(', ')}
LIVELLO DI DIFFICOLTÀ: ${difficulty || 'automatico'}
MATERIA: "${examDescription || 'Esame Universitario'}"
ARGOMENTI DA COPRIRE: ${topics.join('; ')}

FORMATO DI RISPOSTA OBBLIGATORIO (JSON con chiave "questions"):
{
  "questions": [
    {
      "id": "q1",
      "type": "scelta_multipla" | "completamento" | "accoppiamento" | "aperta",
      "question": "Testo chiaro, specifico e accademico della domanda...",
      "options": ["Opzione A...", "Opzione B...", "Opzione C...", "Opzione D..."], // Solo se type === 'scelta_multipla'
      "correctAnswer": "Termine o risposta corretta sintetica", // Per completamento o scelta multipla
      "alternativeAnswers": ["bicarbonato", "HCO3-", "concentrazione bicarbonato"], // Varianti sinonime accettate per completamento
      "matchingPairs": [
        { "left": "Concetto 1", "right": "Definizione/Associazione 1" },
        { "left": "Concetto 2", "right": "Definizione/Associazione 2" },
        { "left": "Concetto 3", "right": "Definizione/Associazione 3" }
      ], // Solo se type === 'accoppiamento'
      "idealAnswerCriteria": "Punti chiave che una risposta aperta deve argomentare", // Solo se type === 'aperta'
      "explanation": "Spiegazione didattica, chiara e incoraggiante",
      "topicTitle": "Titolo argomento specifico",
      "difficulty": "Facile" | "Intermedia" | "Difficile"
    }
  ]
}

REGOLE ESSENZIALI:
1. Per i completamenti, formula la domanda con una frase dove la parola mancante sia un termine chiave preciso (es. "bicarbonato", "insulina", "mitocondrio"). Includi sempre varianti e sinonimi in "alternativeAnswers".
2. Distribuisci le domande equamente tra gli argomenti indicati.
3. Restituisci ESCLUSIVAMENTE il JSON valido.`;

      const quizUserPrompt = `Genera la prova di verifica di ${targetCount} domande per gli argomenti selezionati:
${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

${sourcesContext ? `FONTI DELLO STUDENTE:\n${sourcesContext.slice(0, 25000)}` : ''}`;

      const { response: completion } = await callOpenAIWithFallback(openai, 'gpt-4o-mini', {
        messages: [
          { role: 'system', content: quizSystemPrompt },
          { role: 'user', content: quizUserPrompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      let parsed = { questions: [] };
      try {
        parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
        if (parsed && Array.isArray(parsed.questions)) {
          parsed.questions = parsed.questions.map((q, idx) => ({
            ...q,
            id: q.id || `q_${idx + 1}`,
          }));
        }
      } catch (err) {
        console.error("Errore parsing JSON quiz:", err);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          questions: Array.isArray(parsed.questions) ? parsed.questions : []
        }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 3: VALUTAZIONE MODULARE E COSTRUTTIVA DI UNA RISPOSTA APERTA
    // -------------------------------------------------------------
    if (action === 'evaluate_open_answer') {
      const evaluationSystemPrompt = `Sei un tutor accademico e mentore didattico empatico, costruttivo e incoraggiante.
Il tuo obiettivo è aiutare lo studente a consolidare la sua preparazione universitaria, valorizzando ciò che ha compreso e spiegando con gentilezza e chiarezza cosa andrebbe integrato o corretto.

REGOLE FONDAMENTALI DI TONO E VALUTAZIONE:
1. TONO: Gentile, costruttivo, motivante e pedagogico. Non usare MAI toni duri, offensivi, svalutanti o severi. Lo studente sta imparando!
2. VALUTAZIONE MODULARE IN TRENTESIMI (da 0 a 30):
   - 28-30: Risposta eccellente, ricca e ben argomentata.
   - 24-27: Risposta molto buona (i concetti principali ci sono, manca solo qualche dettaglio o approfondimento).
   - 18-23: Risposta sufficiente (ha centrato l'argomento di base o parte dei meccanismi, con alcune lacune).
   - 10-17: Risposta parziale (ha toccato concetti correlati o parziali, utile come punto di partenza ma incompleta per la domanda).
   - 0-9: Risposta non attinente o lasciata vuota.
3. VALORIZZA I CONCETTI CHIAVE: Se lo studente menziona termini o principi giusti, assegna un punteggio parziale adeguato senza bocciare a 0/30.
4. "isCorrect": imposta su true se score >= 18, altrimenti false.

FORMATO JSON OBBLIGATORIO:
{
  "score": 24,
  "maxScore": 30,
  "isCorrect": true | false,
  "feedback": "Spiegazione chiara, incoraggiante e didattica sul perché della valutazione...",
  "strengths": ["Cosa hai individuato correttamente o espresso bene"],
  "missedPoints": ["Suggerimenti per completare o arricchire la risposta"]
}`;

      const evaluationUserPrompt = `DOMANDA D'ESAME: "${question}"
ARGOMENTO: "${topicTitle || ''}"
CRITERI DI CORRETTEZZA ATTESI: "${idealAnswerCriteria || ''}"

RISPOSTA FORNITA DALLO STUDENTE:
"""
${studentAnswer || '[Nessuna risposta]'}
"""

Fornisci la valutazione didattica e incoraggiante nel formato JSON.`;

      const { response: completion } = await callOpenAIWithFallback(openai, 'gpt-4o-mini', {
        messages: [
          { role: 'system', content: evaluationSystemPrompt },
          { role: 'user', content: evaluationUserPrompt }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      let evaluationResult = {
        score: 18,
        maxScore: 30,
        isCorrect: true,
        feedback: "Valutazione completata.",
        strengths: [],
        missedPoints: []
      };

      try {
        evaluationResult = JSON.parse(completion.choices[0]?.message?.content || '{}');
      } catch (e) {
        console.error("Errore parsing evaluation:", e);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evaluationResult),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 4: RISCRITTURA RAPIDA DI UNA PORZIONE DI TESTO SELEZIONATA
    // -------------------------------------------------------------
    if (action === 'rewrite_selection') {
      const textToRewrite = selectedText || '';
      if (!textToRewrite.trim()) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Nessun testo selezionato da riscrivere.' }),
        };
      }

      let instruction = '';
      if (rewriteMode === 'riassumi') {
        instruction = 'Riassumi e sintetizza in modo conciso e schematico questo passaggio selezionato, mantenendo i concetti chiave evidenziati in grassetto (**termine**).';
      } else if (rewriteMode === 'approfondisci') {
        instruction = 'Approfondisci questo passaggio selezionato fornendo dettagli rigorosi, spiegazioni dei meccanismi, terminologia specialistica, definizioni ed eventuali formule LaTeX ($...$) o tabelle.';
      } else {
        instruction = 'Riscrivi questo testo in modo molto più chiaro, scorrevole, immediato e logico, eliminando complessità inutili ma preservando tutto il rigore concettuale.';
      }

      const rewritePrompt = `${instruction}

TESTO SELEZIONATO DALLO STUDENTE:
"""
${textToRewrite}
"""

${fullContext ? `CONTESTO DELLA LEZIONE:\n${fullContext.slice(0, 3000)}` : ''}

Restituisci ESCLUSIVAMENTE il testo riscritto. Non aggiungere frasi tipo "Ecco il testo riscritto:".`;

      const { response: completion } = await callOpenAIWithFallback(openai, 'gpt-4o-mini', {
        messages: [
          { role: 'system', content: 'Sei un editor e docente universitario esperto nel perfezionare testi accademici.' },
          { role: 'user', content: rewritePrompt }
        ],
        temperature: 0.3,
      });

      const rewrittenText = completion.choices[0]?.message?.content?.trim() || textToRewrite;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewrittenText }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 5: CHATBOT DELLA LEZIONE CON MODIFICA DIRETTA DEL FILE
    // -------------------------------------------------------------
    if (action === 'lesson_chat') {
      const currentLesson = lessonContent || '';
      const userQuestion = prompt || '';

      const lessonChatSystemPrompt = `Sei il Tutor Accademico dedicato a QUESTA SPECIFICA LEZIONE.
Hai accesso completo al testo attuale della lezione dello studente:

--- INIZIO TESTO ATTUALE DELLA LEZIONE ---
${currentLesson.slice(0, 45000)}
--- FINE TESTO ATTUALE DELLA LEZIONE ---

ISTRUZIONI OPERATIVE:
1. RISPOSTA DISCORSIVA: Rispondi con tono chiaro, accademico e utile per lo studio.
2. MODIFICA DIRETTA DEL TESTO DELLA LEZIONE:
   Se lo studente ti chiede di:
   - "Aggiungere", "inserire" o "integrare" una nozione, formula, capitolo o tabella
   - "Riscrivere", "correggere", "semplificare" o "espandere" una parte della lezione
   - "Rimuovere" o "sostituire" qualcosa nel testo
   ALLORA:
   - Trova la posizione logica ottimale e applica la modifica direttamente su tutto il testo della lezione.
   - Restituisci l'INTERO TESTO AGGIORNATO DELLA LEZIONE mantenendo la formattazione pulita (titoli, grassetti **...**, elenchi, tabelle e formule LaTeX $...$).
   - Imposta "hasUpdatedLesson" su true e inserisci il testo aggiornato in "updatedLessonContent".
   - Nel campo "reply", spiega brevemente che hai aggiornato il documento e cosa hai inserito/modificato.
3. Se lo studente fa solo una domanda di chiarimento senza richiedere modifiche al testo, imposta "hasUpdatedLesson" su false e "updatedLessonContent" a null.

FORMATO RISPOSTA OBBLIGATORIO JSON:
{
  "reply": "Messaggio di risposta per la chat...",
  "hasUpdatedLesson": true | false,
  "updatedLessonContent": "Testo completo della lezione con le modifiche apportate (oppure null)"
}`;

      const messagesList = [
        { role: 'system', content: lessonChatSystemPrompt }
      ];

      if (Array.isArray(lessonChatHistory)) {
        lessonChatHistory.forEach(m => {
          messagesList.push({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text || ''
          });
        });
      }

      messagesList.push({
        role: 'user',
        content: userQuestion
      });

      const { response: completion } = await callOpenAIWithFallback(openai, 'gpt-4o-mini', {
        messages: messagesList,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      let parsed = { reply: "Risposta elaborata.", hasUpdatedLesson: false, updatedLessonContent: null };
      try {
        parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
      } catch (err) {
        console.error("Errore parse JSON lesson_chat:", err);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reply: parsed.reply || 'Informazione elaborata.',
          hasUpdatedLesson: Boolean(parsed.hasUpdatedLesson && parsed.updatedLessonContent),
          updatedLessonContent: parsed.updatedLessonContent || null
        }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 6: GENERAZIONE SYLLABUS
    // -------------------------------------------------------------
    if (action === 'generate_syllabus') {
      const numDays = Math.max(3, Math.min(daysTotal || 30, 60));
      const isOnlineSearch = sourceType === 'search_online';

      let perFileSummary = '';
      let validFilesCount = 0;

      if (!isOnlineSearch) {
        const TOTAL_CHAR_BUDGET = 36000;
        const budgetPerFile = Math.max(1200, Math.floor(TOTAL_CHAR_BUDGET / Math.max(1, allFiles.length)));

        allFiles.forEach((f, idx) => {
          const fileName = f.name || `Documento ${idx + 1}`;
          const rawText = (f.text || f.extractedText || '').trim();

          if (rawText && rawText.length > 5) {
            validFilesCount++;
            const fileDigest = createSmartFileDigest(rawText, budgetPerFile);
            perFileSummary += `\n\n--- [FILE ${idx + 1} di ${allFiles.length}]: "${fileName}" ---\n${fileDigest}\n--- [FINE FILE ${idx + 1}] ---\n`;
          }
        });

        if (validFilesCount === 0) {
          return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              error: 'Nessun testo estratto dai documenti caricati. Assicurati che i file contengano testo selezionabile.' 
            }),
          };
        }
      }

      const syllabusSystemPrompt = `Sei un professore universitario e pianificatore didattico di altissimo livello.
Il tuo compito è strutturare un piano di studio accademico completo, coerente e perfettamente bilanciato di esattamente ${numDays} giorni per la materia indicata.

REGOLE DIDATTICHE:
${isOnlineSearch 
  ? `1. RICERCA E STRUTTURAZIONE ACCADEMICA: Attingi alle migliori nozioni universitarie e ai programmi di corso ufficiali per la materia "${examDescription}". Struttura gli argomenti dai fondamenti propedeutici fino ai concetti avanzati e alle simulazioni finali.`
  : `1. COPERTURA TOTALE FONTI (100%): Includi obbligatoriamente argomenti e capitoli da TUTTI i ${validFilesCount} file caricati (dal File 1 all'ultimo).
2. ESCLUSIVITÀ DELLE FONTI: Usa SOLO nozioni e temi presenti nei file allegati dello studente.`
}
2. PROGRESSIONE LOGICA: Ogni giornata ("dayTitle") deve avere da 1 a 3 argomenti specifici ("topics") con titoli chiari ed esaustivi.
3. FORMATO RISPOSTA: Restituisci ESCLUSIVAMENTE un JSON valido con questa struttura esatta:
{
  "schedule": [
    {
      "dayNumber": 1,
      "dayTitle": "Giorno 1: Titolo modulo didattico",
      "phase": "Fase 1: Studio e Comprensione",
      "topics": [
        {
          "id": "d1_t1",
          "title": "Titolo specifico dell'argomento",
          "difficulty": "Fondamentale"
        }
      ]
    }
  ]
}`;

      const syllabusUserPrompt = `Materia/Descrizione: "${examDescription || 'Programma di Studio Universitario'}".
Giorni disponibili per lo studio: ${numDays}.
Livello di preparazione desiderato: ${prepLevel || 80}%.
Tipologia prova: ${payload.examType || 'orale'}.
Stile espositivo: ${languageStyle || 'automatico'}.
Modalità fonti: ${isOnlineSearch ? 'Ricerca e strutturazione accademica online' : `Materiali dello studente (${validFilesCount} file)`}.

${isOnlineSearch ? 'Genera il programma universitario completo per questa materia.' : `TESTO ESTRATTO DAI DOCUMENTI:\n${perFileSummary}`}

Genera il piano di studio JSON.`;

      const targetModel = (prepLevel >= 85) ? 'gpt-5.6-terra' : 'gpt-4o-mini';

      const { response: completion, modelUsed } = await callOpenAIWithFallback(openai, targetModel, {
        messages: [
          { role: 'system', content: syllabusSystemPrompt },
          { role: 'user', content: syllabusUserPrompt }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      const rawResponse = completion.choices[0]?.message?.content || '{}';
      let parsed = {};
      try {
        parsed = JSON.parse(rawResponse);
        if (parsed.schedule && Array.isArray(parsed.schedule)) parsed = parsed.schedule;
        else if (parsed.days && Array.isArray(parsed.days)) parsed = parsed.days;
        else if (Array.isArray(parsed)) parsed = parsed;
        else if (typeof parsed === 'object') {
          const arr = Object.values(parsed).find(v => Array.isArray(v));
          if (arr) parsed = arr;
        }
      } catch (err) {
        console.error("Errore parsing JSON syllabus:", err);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          schedule: Array.isArray(parsed) && parsed.length > 0 ? parsed : null,
          filesCovered: validFilesCount,
          modelUsed: modelUsed
        }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 7: GENERAZIONE LEZIONE DIDATTICA
    // -------------------------------------------------------------
    if (isLessonGeneration) {
      const isStrict = sourceType === 'my_materials';
      
      let relevantSources = '';
      allFiles.forEach((f, idx) => {
        const text = (f.text || f.extractedText || '').trim();
        if (text) {
          relevantSources += `\n\n=== DOCUMENTO: "${f.name || `File ${idx + 1}`}" ===\n${text.slice(0, 20000)}\n=== FINE DOCUMENTO ===\n`;
        }
      });

      const lessonSystemPrompt = `Sei un docente universitario e tutor accademico di altissimo livello.
Il tuo compito è redigere una lezione didattica specialistica, chiara, altamente logica, approfondita ed esaustiva sul tema richiesto.

${isStrict ? `REGOLA FONDAMENTALE E RIGIDA:
Devi spiegare l'argomento basandoti UNICAMENTE ED ESCLUSIVAMENTE sulle informazioni, spiegazioni, definizioni, formule ed esempi PRESENTI NEI DOCUMENTI ALLEGATI DELLO STUDENTE.
NON aggiungere nozioni esterne da internet.
Il tuo compito è rendere il materiale originale molto più chiaro, ordinato, schematizzato e pedagogico, senza inventare o deviare dalle fonti caricate.` : `Spiega l'argomento attingendo alle migliori nozioni scientifiche e accademiche universitarie.`}

FORMATTAZIONE:
- Usa titoli chiari in Markdown (##, ###).
- Evidenzia SEMPRE i termini tecnici e i concetti fondamentali in GRASSETTO (**termine**).
- Usa elenchi puntati strutturati e tabelle comparative Markdown.
- Per qualsiasi formula scientifica, chimica, medica, fisica o statistica, USA LA NOTAZIONE LaTeX ($formula$ o $$formula$$).`;

      const lessonUserPrompt = `Argomento della lezione: "${topicTitle}".
Materia: "${examDescription || ''}", Livello target: ${prepLevel || 80}%, Stile: ${languageStyle || 'automatico'}.

${relevantSources ? `FONTI DELLO STUDENTE ESTRATTE DAI FILE CARICATI:\n${relevantSources.slice(0, 35000)}` : ''}

Redigi la lezione didattica in modo chiaro, schematizzato e rigorosamente fedele al tema.`;

      const { response: completion, modelUsed } = await callOpenAIWithFallback(openai, 'gpt-4o-mini', {
        messages: [
          { role: 'system', content: lessonSystemPrompt },
          { role: 'user', content: lessonUserPrompt }
        ],
        temperature: 0.3,
      });

      const reply = completion.choices[0]?.message?.content || 'Nessuna lezione generata.';
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply, modelUsed }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 8: CHAT HOMEPAGE STANDARD CON MULTI-FILE (FINO A 10 FILE)
    // -------------------------------------------------------------
    let chatSourcesText = '';
    const imageParts = [];

    allFiles.slice(0, 10).forEach((f, idx) => {
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
        const text = (f.text || f.extractedText || '').trim();
        if (text) {
          chatSourcesText += `\n\n--- [FILE ALLEGATO ${idx + 1}: "${f.name}"] ---\n${text.slice(0, 10000)}\n--- [FINE FILE ${idx + 1}] ---\n`;
        }
      }
    });

    const userPrompt = prompt || '';
    const standardSystemInstruction = `Sei un tutor universitario e assistente allo studio avanzato.
Rispondi in modo chiaro, approfondito, logico e pedagogico in formato Markdown con termini chiave in grassetto ed equazioni LaTeX in $ o $$ quando utili. Se l'utente allega file o immagini, analizzali attentamente per rispondere in modo preciso.`;

    let finalPromptText = userPrompt;
    if (chatSourcesText) {
      finalPromptText += `\n\n=== DOCUMENTI E FILE ALLEGATI DALL'UTENTE (${allFiles.length} file) ===${chatSourcesText.slice(0, 35000)}`;
    }

    const messages = [
      { role: 'system', content: standardSystemInstruction }
    ];

    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text,
        });
      }
    }

    if (imageParts.length > 0) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: finalPromptText || 'Analizza questi file e immagini di studio.' },
          ...imageParts
        ]
      });
    } else {
      messages.push({
        role: 'user',
        content: finalPromptText || 'Ciao!',
      });
    }

    const { response: completion, modelUsed } = await callOpenAIWithFallback(openai, 'gpt-4o-mini', {
      messages: messages,
      temperature: 0.5,
    });

    const reply = completion.choices[0]?.message?.content || 'Nessuna risposta generata.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply, modelUsed }),
    };
  } catch (error) {
    console.error('Errore backend:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Errore durante la generazione.' }),
    };
  }
};
