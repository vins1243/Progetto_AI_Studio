import OpenAI from 'openai';

// Helper per eseguire chiamate con fallback automatico di sicurezza
async function callOpenAIWithFallback(openai, primaryModel, params) {
  const fallbackChain = [primaryModel];
  if (primaryModel.startsWith('gpt-5.6')) {
    if (primaryModel === 'gpt-5.6-sol') fallbackChain.push('gpt-5.6-terra', 'gpt-4o');
    else if (primaryModel === 'gpt-5.6-terra') fallbackChain.push('gpt-5.6-luna', 'gpt-4o-mini');
    else fallbackChain.push('gpt-4o-mini');
  } else {
    fallbackChain.push('gpt-4o-mini');
  }

  let lastError = null;
  for (const modelName of fallbackChain) {
    try {
      const response = await openai.chat.completions.create({
        ...params,
        model: modelName,
      });
      return { response, modelUsed: modelName };
    } catch (err) {
      console.warn(`Tentativo con modello ${modelName} fallito:`, err.message);
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
      languageStyle
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
    // AZIONE 1: GENERAZIONE SYLLABUS (MINIMO gpt-5.6-terra o gpt-5.6-sol)
    // -------------------------------------------------------------
    if (action === 'generate_syllabus') {
      const numDays = Math.max(3, Math.min(daysTotal || 30, 60));

      let perFileSummary = '';
      let validFilesCount = 0;

      allFiles.forEach((f, idx) => {
        const fileName = f.name || `Documento ${idx + 1}`;
        const rawText = (f.text || f.extractedText || '').trim();

        if (rawText && rawText.length > 10) {
          validFilesCount++;
          const fileDigest = rawText.slice(0, 15000);
          perFileSummary += `\n\n--- [FILE ${idx + 1} di ${allFiles.length}]: "${fileName}" (Parole: ${f.wordsCount || rawText.split(/\s+/).length}) ---\n${fileDigest}\n--- [FINE FILE ${idx + 1}: "${fileName}"] ---\n`;
        }
      });

      if (sourceType === 'my_materials' && validFilesCount === 0) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            error: 'Nessun testo estratto dai documenti caricati. Assicurati che i documenti contengano testo leggibile.' 
          }),
        };
      }

      // Routing intelligente: Se il livello target è >= 85% o ci sono molti file, usa il modello top (Sol), altrimenti Terra
      const targetModel = (prepLevel >= 85 || validFilesCount >= 4) ? 'gpt-5.6-sol' : 'gpt-5.6-terra';

      const syllabusSystemPrompt = `Sei un professore universitario e pianificatore didattico di altissimo livello accademico.
Il tuo compito è analizzare TUTTI i ${validFilesCount} documenti caricati dallo studente e strutturare un piano di studio completo e perfettamente bilanciato per esattamente ${numDays} giorni.

REGOLE TASSATIVE:
1. COPERTURA TOTALE (100%): Includi argomenti e capitoli da OGNI SINGOLO FILE caricato (dal File 1 all'ultimo File ${allFiles.length}). Nessun documento deve essere escluso.
2. FONTI ESCLUSIVE: Tutti i temi del piano devono essere tratti ESCLUSIVAMENTE dai testi e dai capitoli presenti nei file allegati. Non inventare nozioni estranee.
3. PROGRESSIONE DIDATTICA: Organizza gli argomenti secondo un ordine logico, propedeutico e continuo.
4. STRUTTURA GIORNALIERA: Ogni giorno ("dayTitle") deve contenere da 1 a 3 argomenti ("topics") con titoli specifici, chiari ed esaustivi tratti direttamente dalle fonti.
5. FORMATO RISPOSTA: Restituisci ESCLUSIVAMENTE un JSON valido con questa struttura esatta:
{
  "schedule": [
    {
      "dayNumber": 1,
      "dayTitle": "Giorno 1: Titolo modulo estratto dalle fonti",
      "phase": "Fase 1: Studio e Comprensione",
      "topics": [
        {
          "id": "d1_t1",
          "title": "Titolo specifico dell'argomento presente nelle fonti",
          "difficulty": "Fondamentale"
        }
      ]
    }
  ]
}`;

      const syllabusUserPrompt = `Materia/Note studente: "${examDescription || 'Programma di Studio'}".
Giorni disponibili: ${numDays}.
Livello di preparazione desiderato: ${prepLevel || 80}%.
Stile: ${languageStyle || 'automatico'}.
Numero totale di documenti da includere: ${validFilesCount}.

FONTI E CONTENUTO ESTRATTO DA TUTTI I FILE DELLO STUDENTE:
${perFileSummary}

Esegui la scansione completa di tutti i file e genera il piano di studio JSON che copre il 100% dei materiali allegati.`;

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
    // AZIONE 2: GENERAZIONE LEZIONI (MINIMO gpt-5.6-terra o gpt-5.6-sol)
    // -------------------------------------------------------------
    if (isLessonGeneration) {
      const isStrict = sourceType === 'my_materials';
      
      let combinedSources = '';
      allFiles.forEach((f, idx) => {
        const text = (f.text || f.extractedText || '').trim();
        if (text) {
          combinedSources += `\n\n=== DOCUMENTO: "${f.name || `File ${idx + 1}`}" ===\n${text}\n=== FINE DOCUMENTO ===\n`;
        }
      });

      // Routing lezioni: Se livello target >= 85% o materia specialistica complessa usa Sol, altrimenti Terra
      const targetModel = (prepLevel >= 85) ? 'gpt-5.6-sol' : 'gpt-5.6-terra';

      const lessonSystemPrompt = `Sei un docente universitario e tutor accademico di altissimo livello.
Il tuo compito è redigere una lezione/riassunto specialistico, chiaro, altamente logico e approfondito sull'argomento richiesto.

${isStrict ? `REGOLA FONDAMENTALE E RIGIDA:
Devi spiegare l'argomento basandoti UNICAMENTE ED ESCLUSIVAMENTE sulle informazioni, spiegazioni, definizioni, formule ed esempi PRESENTI NEI DOCUMENTI ALLEGATI DELLO STUDENTE.
NON aggiungere nozioni esterne da internet.
Il tuo compito è rendere il materiale originale molto più chiaro, ordinato, schematizzato e pedagogico, senza inventare o deviare dalle fonti caricate.` : `Spiega l'argomento attingendo alle migliori nozioni scientifiche e accademiche di riferimento.`}

FORMATTAZIONE:
- Usa titoli chiari in Markdown (##, ###).
- Evidenzia SEMPRE i termini tecnici e i concetti fondamentali in GRASSETTO (**termine**).
- Usa elenchi puntati strutturati e tabelle comparative.
- Per qualsiasi formula scientifica, chimica, medica, fisica o statistica, USA LA NOTAZIONE LaTeX ($formula$ o $$formula$$).`;

      const lessonUserPrompt = `Argomento della lezione: "${topicTitle}".
Materia: "${examDescription || ''}", Livello target: ${prepLevel || 80}%, Stile: ${languageStyle || 'automatico'}.

${combinedSources ? `FONTI DELLO STUDENTE ESTRATTE DAI FILE CARICATI:\n${combinedSources.slice(0, 90000)}` : ''}

Redigi la lezione didattica in modo chiaro, schematizzato e rigorosamente fedele alle fonti fornite.`;

      const { response: completion, modelUsed } = await callOpenAIWithFallback(openai, targetModel, {
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
    // AZIONE 3: CHAT CON SMART ROUTER (gpt-4o-mini valuta la complessità)
    // -------------------------------------------------------------
    let chatSources = '';
    allFiles.forEach(f => {
      const text = (f.text || f.extractedText || '').trim();
      if (text) chatSources += `\n\n--- DOCUMENTO "${f.name}" ---\n${text.slice(0, 20000)}`;
    });

    const userPrompt = prompt || '';

    // Step di valutazione complessità eseguito da gpt-4o-mini (Router ultra-veloce ed economico)
    let selectedChatModel = 'gpt-5.6-terra'; // default
    try {
      const routerEval = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Sei un router di complessità. Valuta la complessità della richiesta dello studente e rispondi ESCLUSIVAMENTE con una sola parola tra:
- "luna": per domande semplici, definizioni brevi, chiarimenti elementari o saluti.
- "terra": per spiegazioni standard, riassunti di media complessità, schematizzazioni o quiz.
- "sol": per problemi complessi, dimostrazioni approfondite, casi clinici complessi, analisi comparative multifattoriali o formule avanzate.`
          },
          {
            role: 'user',
            content: `Richiesta studente: "${userPrompt}"`
          }
        ],
        max_tokens: 10,
        temperature: 0.0,
      });

      const evaluation = (routerEval.choices[0]?.message?.content || '').toLowerCase().trim();
      if (evaluation.includes('sol')) selectedChatModel = 'gpt-5.6-sol';
      else if (evaluation.includes('luna')) selectedChatModel = 'gpt-5.6-luna';
      else selectedChatModel = 'gpt-5.6-terra';
    } catch (routerErr) {
      console.warn("Router gpt-4o-mini fallito, fallback su terra:", routerErr);
      selectedChatModel = 'gpt-5.6-terra';
    }

    const standardSystemInstruction = `Sei un tutor universitario e assistente allo studio avanzato.
Rispondi in modo chiaro, approfondito e pedagogico in formato Markdown con termini chiave in grassetto ed equazioni LaTeX in $ o $$ quando utili.`;

    let finalPromptText = userPrompt;
    if (chatSources) {
      finalPromptText += `\n\n--- DOCUMENTI ALLEGATI DALL'UTENTE ---${chatSources.slice(0, 60000)}`;
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

    const { response: completion, modelUsed } = await callOpenAIWithFallback(openai, selectedChatModel, {
      messages: messages,
      temperature: 0.5,
    });

    const reply = completion.choices[0]?.message?.content || 'Nessuna risposta generata.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply, modelUsed, routerCategory: selectedChatModel }),
    };
  } catch (error) {
    console.error('Errore backend:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Errore durante la generazione.' }),
    };
  }
};
