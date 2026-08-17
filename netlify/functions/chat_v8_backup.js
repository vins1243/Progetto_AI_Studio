import OpenAI from 'openai';

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
      extractedText, // Testo pulito già estratto dal client da PDF, Word, PPTX o file di testo
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

    // Gestione immagini se presenti
    const allFiles = files && Array.isArray(files) ? files : (file ? [file] : []);
    const imageParts = [];
    for (const f of allFiles) {
      if (f && f.base64 && (f.mimeType || '').startsWith('image/')) {
        imageParts.push({
          type: 'image_url',
          image_url: {
            url: f.base64.startsWith('data:') ? f.base64 : `data:${f.mimeType || 'image/jpeg'};base64,${f.base64}`,
          },
        });
      }
    }

    const documentContent = (extractedText || '').trim();

    // -------------------------------------------------------------
    // AZIONE 1: GENERAZIONE SYLLABUS BASATO AL 100% SULLE FONTI
    // -------------------------------------------------------------
    if (action === 'generate_syllabus') {
      const numDays = Math.max(3, Math.min(daysTotal || 30, 45));

      if (sourceType === 'my_materials' && !documentContent && imageParts.length === 0) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            error: 'Nessun testo leggibile estratto dai file caricati. Assicurati che i documenti contengano testo selezionabile e non siano scansioni vuote.' 
          }),
        };
      }

      const syllabusSystemPrompt = `Sei un professore universitario e pianificatore didattico esperto.
Il tuo compito è analizzare approfonditamente il testo estratto dai documenti dello studente e creare un piano di studio di esattamente ${numDays} giorni.

REGOLE INDEROGABILI:
1. FONTI ESCLUSIVE: Tutti i temi e argomenti del piano DEVONO provenire DIRETTAMENTE dai contenuti e capitoli presenti nel testo fornito. Non inventare nozioni o moduli generici non menzionati nel materiale.
2. ORDINAMENTO LOGICO: Disponi gli argomenti secondo un percorso didattico coerente e progressivo.
3. MODULARITÀ: Ogni giornata ("dayTitle") deve contenere 1, 2 o al massimo 3 argomenti ("topics") con titoli descrittivi e reali estratti dal testo.
4. FORMATO DI RISPOSTA: Restituisci ESCLUSIVAMENTE un JSON valido con questa struttura:
{
  "schedule": [
    {
      "dayNumber": 1,
      "dayTitle": "Giorno 1: Titolo tema principale estratto dalle fonti",
      "phase": "Fase 1: Studio e Comprensione",
      "topics": [
        {
          "id": "d1_t1",
          "title": "Titolo reale dell'argomento presente nel testo",
          "difficulty": "Fondamentale"
        }
      ]
    }
  ]
}`;

      const syllabusUserPrompt = `Materia/Note studente: "${examDescription || 'Programma di Studio'}".
Giorni disponibili: ${numDays}.
Livello target: ${prepLevel || 80}%.
Stile: ${languageStyle || 'automatico'}.

${documentContent ? `TESTO COMPLETO ESTRATTO DAI DOCUMENTI DELLO STUDENTE:\n${documentContent.slice(0, 75000)}` : 'Nessun file testuale, basati sulla descrizione accademica.'}

Genera il piano di studio JSON rigorosamente vincolato alle fonti fornite.`;

      const messages = [
        { role: 'system', content: syllabusSystemPrompt }
      ];

      if (imageParts.length > 0) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: syllabusUserPrompt },
            ...imageParts,
          ],
        });
      } else {
        messages.push({
          role: 'user',
          content: syllabusUserPrompt,
        });
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
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
          wordsAnalyzed: documentContent ? documentContent.split(/\s+/).length : 0
        }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 2: GENERAZIONE LEZIONE RIGOROSA
    // -------------------------------------------------------------
    if (isLessonGeneration) {
      const isStrict = sourceType === 'my_materials';
      const lessonSystemPrompt = `Sei un docente universitario e tutor accademico di altissimo livello.
Il tuo compito è redigere una lezione/riassunto specialistico, chiaro, altamente logico e approfondito sull'argomento richiesto.

${isStrict ? `REGOLA INDEROGABILE:
Devi spiegare l'argomento basandoti UNICAMENTE ED ESCLUSIVAMENTE sulle informazioni, spiegazioni, definizioni, formule ed esempi PRESENTI NEI TESTI ALLEGATI DELLO STUDENTE.
NON aggiungere nozioni esterne da internet.
Il tuo compito è rendere il materiale originale molto più chiaro, ordinato, schematizzato e pedagogico, senza inventare o deviare dalle fonti caricate.` : `Spiega l'argomento attingendo alle migliori nozioni scientifiche e accademiche di riferimento.`}

FORMATTAZIONE:
- Usa titoli chiari in Markdown (##, ###).
- Evidenzia SEMPRE i termini tecnici e i concetti fondamentali in GRASSETTO (**termine**).
- Usa elenchi puntati strutturati e tabelle comparative.
- Per qualsiasi formula scientifica, chimica, medica, fisica o statistica, USA LA NOTAZIONE LaTeX ($formula$ o $$formula$$).`;

      const lessonUserPrompt = `Argomento della lezione: "${topicTitle}".
Materia: "${examDescription || ''}", Livello target: ${prepLevel || 80}%, Stile: ${languageStyle || 'automatico'}.

${documentContent ? `TESTO DELLE FONTI DELLO STUDENTE:\n${documentContent.slice(0, 85000)}` : ''}

Redigi la lezione didattica in modo chiaro, schematizzato e rigorosamente fedele alle fonti fornite.`;

      const messagesList = [
        { role: 'system', content: lessonSystemPrompt }
      ];

      if (imageParts.length > 0) {
        messagesList.push({
          role: 'user',
          content: [
            { type: 'text', text: lessonUserPrompt },
            ...imageParts,
          ],
        });
      } else {
        messagesList.push({
          role: 'user',
          content: lessonUserPrompt,
        });
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messagesList,
        temperature: 0.3,
      });

      const reply = completion.choices[0]?.message?.content || 'Nessuna lezione generata.';
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 3: CHAT STANDARD
    // -------------------------------------------------------------
    const standardSystemInstruction = `Sei un tutor universitario e assistente allo studio avanzato.
Rispondi in modo chiaro, approfondito e pedagogico in formato Markdown con termini chiave in grassetto ed equazioni LaTeX in $ o $$ quando utili.`;

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

    let finalPromptText = prompt || '';
    if (documentContent) {
      finalPromptText += `\n\n--- TESTO DEI DOCUMENTI ALLEGATI DALL'UTENTE ---\n${documentContent.slice(0, 60000)}`;
    }

    if (imageParts.length > 0) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: finalPromptText },
          ...imageParts,
        ],
      });
    } else {
      messages.push({
        role: 'user',
        content: finalPromptText,
      });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.5,
    });

    const reply = completion.choices[0]?.message?.content || 'Nessuna risposta generata.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    };
  } catch (error) {
    console.error('Errore backend OpenAI:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Errore durante la generazione.' }),
    };
  }
};
