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
      // Parametri per chatbot dedicato con modifica diretta del testo
      lessonContent,
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
    // AZIONE 1: RISCRITTURA RAPIDA DI UNA PORZIONE DI TESTO SELEZIONATA
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
        // 'chiaro' o 'riscrivi meglio'
        instruction = 'Riscrivi questo testo in modo molto più chiaro, scorrevole, immediato e logico, eliminando complessità inutili ma preservando tutto il rigore concettuale.';
      }

      const rewritePrompt = `${instruction}

TESTO SELEZIONATO DALLO STUDENTE:
"""
${textToRewrite}
"""

${fullContext ? `CONTESTO DELLA LEZIONE:\n${fullContext.slice(0, 3000)}` : ''}

Restituisci ESCLUSIVAMENTE il testo riscritto (con grassetti, elenchi o formule se opportune). Non aggiungere frasi introduttive tipo "Ecco il testo riscritto:".`;

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
    // AZIONE 2: CHATBOT DELLA LEZIONE CON MODIFICA DIRETTA DEL FILE
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
    // AZIONE 3: GENERAZIONE SYLLABUS (CON SUPPORTO COMPLETO "CERCA ONLINE")
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
