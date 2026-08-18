import OpenAI from 'openai';

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

// Chiamata sicura con fallback su gpt-4o-mini
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
      // Parametri per chat dedicata della lezione con integrazione testo
      lessonText,
      lessonChatHistory
    } = payload;

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Chiave OPENAI_API_KEY non configurata su Netlify.' }),
      };
    }

    const openai = new OpenAI({ apiKey });
    const allFiles = Array.isArray(files) ? files : [];

    // -------------------------------------------------------------
    // AZIONE 1: RISCRITTURA DI UNA PORZIONE DI TESTO SELEZIONATA
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
        instruction = 'Riassumi e sintetizza questo passaggio in modo conciso e schematico, mantenendo i concetti chiave essenziali evidenziati in grassetto (**concetto**).';
      } else if (rewriteMode === 'approfondisci') {
        instruction = 'Approfondisci questo passaggio fornendo spiegazioni più dettagliate dei meccanismi, terminologia specialistica, definizioni rigorose ed eventuali formule LaTeX ($...$) o tabelle di confronto.';
      } else {
        // 'chiaro' / semplifica
        instruction = 'Riscrivi questo testo rendendolo estremamente più chiaro, scorrevole, intuitivo e comprensibile, eliminando ambiguità ma mantenendo il rigore accademico.';
      }

      const rewritePrompt = `${instruction}

TESTO ORIGINALE SELEZIONATO DALLO STUDENTE:
"""
${textToRewrite}
"""

${fullContext ? `CONTESTO DELLA LEZIONE:\n${fullContext.slice(0, 3000)}` : ''}

Restituisci ESCLUSIVAMENTE il testo riscritto e formattato in Markdown, senza preamboli o commenti iniziali/finali.`;

      const { response: completion } = await callOpenAIWithFallback(openai, 'gpt-4o-mini', {
        messages: [
          { role: 'system', content: 'Sei un editor e docente universitario esperto nel perfezionare testi accademici.' },
          { role: 'user', content: rewritePrompt }
        ],
        temperature: 0.3,
      });

      const rewrittenText = completion.choices[0]?.message?.content || textToRewrite;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewrittenText }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 2: CHATBOT DEDICATO ALLA LEZIONE CON PROPOSTA INTEGRAZIONE
    // -------------------------------------------------------------
    if (action === 'lesson_chat') {
      const currentLesson = lessonText || '';
      const userQuestion = prompt || '';

      const lessonChatSystemPrompt = `Sei il Tutor Accademico personale dedicato a QUESTA SPECIFICA LEZIONE.
Hai la visione completa del testo attualmente presente nella lezione:

--- INIZIO TESTO ATTUALE DELLA LEZIONE ---
${currentLesson.slice(0, 45000)}
--- FINE TESTO ATTUALE DELLA LEZIONE ---

COMPITI:
1. Rispondi alle domande dello studente con massima chiarezza pedagogica, citando nozioni ed esempi pertinenti.
2. RICHIESTE DI MODIFICA O INTEGRAZIONE DEL TESTO:
   Se lo studente ti chiede di "inserire", "aggiungere", "integrare", "modificare" o "completare" il testo della lezione con una nuova nozione, tabella, formula o spiegazione:
   - Individua il punto migliore e più logico all'interno della lezione in cui integrare l'informazione.
   - Crea il TESTO COMPLETO DELLA LEZIONE AGGIORNATO (preservando tutto il resto della lezione e integrando armoniosamente la nuova parte in Markdown/LaTeX).
   - Nel tuo messaggio di risposta in chat, spiega brevemente dove e cosa hai integrato.
   - Imposta "hasProposedChange" su true e inserisci l'intero testo aggiornato in "proposedLessonText".
3. Se lo studente fa una semplice domanda o richiesta di spiegazione senza chiedere modifiche al documento, rispondi normalmente in chat e imposta "hasProposedChange" su false con "proposedLessonText" a null.

FORMATO DI RISPOSTA OBBLIGATORIO (JSON):
{
  "reply": "Risposta discorsiva per la chat...",
  "hasProposedChange": true | false,
  "proposedLessonText": "Testo Markdown completo della lezione aggiornata (oppure null se non richiesta modifica)"
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

      let parsed = { reply: "Risposta elaborata.", hasProposedChange: false, proposedLessonText: null };
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
          hasProposedChange: Boolean(parsed.hasProposedChange && parsed.proposedLessonText),
          proposedLessonText: parsed.proposedLessonText || null
        }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 3: GENERAZIONE SYLLABUS (CON SUPPORTO "CERCA ONLINE" E "USA FONTI")
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
    // AZIONE 4: GENERAZIONE LEZIONE DIDATTICA
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
    // AZIONE 5: CHAT STANDARD HOMEPAGE
    // -------------------------------------------------------------
    let chatSources = '';
    allFiles.forEach(f => {
      const text = (f.text || f.extractedText || '').trim();
      if (text) chatSources += `\n\n--- DOCUMENTO "${f.name}" ---\n${text.slice(0, 15000)}`;
    });

    const userPrompt = prompt || '';
    const standardSystemInstruction = `Sei un tutor universitario e assistente allo studio avanzato.
Rispondi in modo chiaro, approfondito e pedagogico in formato Markdown con termini chiave in grassetto ed equazioni LaTeX in $ o $$ quando utili.`;

    let finalPromptText = userPrompt;
    if (chatSources) {
      finalPromptText += `\n\n--- DOCUMENTI ALLEGATI DALL'UTENTE ---${chatSources.slice(0, 30000)}`;
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

    messages.push({
      role: 'user',
      content: finalPromptText,
    });

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
