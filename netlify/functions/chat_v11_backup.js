import OpenAI from 'openai';

// Helper per compattare intelligentemente i documenti ed evitare sforamenti del limite TPM (Tokens Per Minute)
function createSmartFileDigest(rawText, maxChars) {
  if (!rawText) return '';
  const clean = rawText.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;

  // Prende la parte iniziale (indice/primi capitoli) e le conclusioni/schemi finali
  const headBudget = Math.floor(maxChars * 0.7);
  const tailBudget = Math.floor(maxChars * 0.3);
  const head = clean.slice(0, headBudget);
  const tail = clean.slice(-tailBudget);
  return `${head}\n[... SEZIONI E DETTAGLI INTERMEDI ...]\n${tail}`;
}

// Chiamata con fallback automatico anti-429 (Rate Limit) e anti-404 (Model Not Found)
async function callOpenAIWithFallback(openai, primaryModel, params) {
  // Catena di fallback: prova il modello richiesto, poi scala sempre su gpt-4o-mini che ha un limite altissimo (2.000.000 TPM)
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
      console.warn(`Chiamata con ${modelName} fallita (${err.status || err.message}). Fallback...`);
      lastError = err;
      // Se l'errore è 429 (limite token superato) o 404 (modello non accessibile), prova immediatamente gpt-4o-mini
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
    // AZIONE 1: GENERAZIONE SYLLABUS CON BUDGET DI TOKEN OTTIMIZZATO
    // -------------------------------------------------------------
    if (action === 'generate_syllabus') {
      const numDays = Math.max(3, Math.min(daysTotal || 30, 60));

      // Budget totale di caratteri per rimanere SEMPRE sotto i 15.000 token (~60.000 caratteri totali)
      const TOTAL_CHAR_BUDGET = 38000;
      const budgetPerFile = Math.max(1200, Math.floor(TOTAL_CHAR_BUDGET / Math.max(1, allFiles.length)));

      let perFileSummary = '';
      let validFilesCount = 0;

      allFiles.forEach((f, idx) => {
        const fileName = f.name || `Documento ${idx + 1}`;
        const rawText = (f.text || f.extractedText || '').trim();

        if (rawText && rawText.length > 5) {
          validFilesCount++;
          const fileDigest = createSmartFileDigest(rawText, budgetPerFile);
          perFileSummary += `\n\n--- [FILE ${idx + 1} di ${allFiles.length}]: "${fileName}" ---\n${fileDigest}\n--- [FINE FILE ${idx + 1}] ---\n`;
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

      const syllabusSystemPrompt = `Sei un professore universitario e pianificatore didattico di altissimo livello.
Il tuo compito è analizzare TUTTI i ${validFilesCount} documenti caricati dallo studente e strutturare un piano di studio completo di esattamente ${numDays} giorni.

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
Giorni disponibili per lo studio: ${numDays}.
Livello di preparazione desiderato: ${prepLevel || 80}%.
Stile: ${languageStyle || 'automatico'}.
Numero totale di documenti da includere obbligatoriamente: ${validFilesCount}.

FONTI E CONTENUTO ESTRATTO DA TUTTI I FILE DELLO STUDENTE:
${perFileSummary}

Esegui la scansione completa di tutti i file e genera il piano di studio JSON che copre il 100% dei materiali allegati.`;

      // Proviamo prima con modello avanzato, con fallback trasparente su gpt-4o-mini in caso di 429
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
    // AZIONE 2: GENERAZIONE LEZIONI
    // -------------------------------------------------------------
    if (isLessonGeneration) {
      const isStrict = sourceType === 'my_materials';
      
      let relevantSources = '';
      allFiles.forEach((f, idx) => {
        const text = (f.text || f.extractedText || '').trim();
        if (text) {
          // Mantieni una porzione compatta (max 20.000 caratteri per file)
          relevantSources += `\n\n=== DOCUMENTO: "${f.name || `File ${idx + 1}`}" ===\n${text.slice(0, 20000)}\n=== FINE DOCUMENTO ===\n`;
        }
      });

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

${relevantSources ? `FONTI DELLO STUDENTE ESTRATTE DAI FILE CARICATI:\n${relevantSources.slice(0, 35000)}` : ''}

Redigi la lezione didattica in modo chiaro, schematizzato e rigorosamente fedele alle fonti fornite.`;

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
    // AZIONE 3: CHAT STANDARD
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
