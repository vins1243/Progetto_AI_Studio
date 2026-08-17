import OpenAI from 'openai';
import pdfParse from 'pdf-parse';

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

    // Estrazione del testo reale da tutti i file caricati (PDF, TXT, DOCX, ecc.)
    const allFiles = files && Array.isArray(files) ? files : (file ? [file] : []);
    const imageParts = [];
    let aggregatedFileText = '';

    for (const f of allFiles) {
      if (f && f.base64) {
        const mime = f.mimeType || '';
        const isPdf = mime.includes('pdf') || (f.name && f.name.toLowerCase().endsWith('.pdf'));
        const isImage = mime.startsWith('image/');

        if (isImage) {
          imageParts.push({
            type: 'image_url',
            image_url: {
              url: f.base64.startsWith('data:') ? f.base64 : `data:${mime || 'image/jpeg'};base64,${f.base64}`,
            },
          });
        } else {
          try {
            const rawBase64 = f.base64.split(',')[1] || f.base64;
            const buffer = Buffer.from(rawBase64, 'base64');

            if (isPdf) {
              // Estrazione testo da PDF
              const pdfData = await pdfParse(buffer);
              const cleanText = pdfData.text ? pdfData.text.replace(/\r\n/g, '\n').slice(0, 120000) : '';
              aggregatedFileText += `\n\n=== DOCUMENTO PDF CARICATO: ${f.name} ===\n${cleanText}\n=== FINE DOCUMENTO: ${f.name} ===\n`;
            } else {
              // File di testo / markdown / appunti
              const textContent = buffer.toString('utf-8').slice(0, 120000);
              aggregatedFileText += `\n\n=== DOCUMENTO TESTO: ${f.name} ===\n${textContent}\n=== FINE DOCUMENTO ===\n`;
            }
          } catch (err) {
            console.error(`Errore estrazione testo per ${f.name}:`, err);
            aggregatedFileText += `\n\n[File allegato: ${f.name} (estrazione testo non riuscita)]\n`;
          }
        }
      }
    }

    // -------------------------------------------------------------
    // AZIONE 1: GENERAZIONE SYLLABUS INTELLIGENTE BASATO SULLE FONTI
    // -------------------------------------------------------------
    if (action === 'generate_syllabus') {
      const numDays = Math.max(3, Math.min(daysTotal || 30, 60));
      
      const syllabusSystemPrompt = `Sei un esperto pianificatore accademico e professore universitario.
Il tuo compito è analizzare i documenti e materiali caricati dallo studente e creare un piano di studio dettagliato suddiviso per ${numDays} giorni.

REGOLE TASSATIVE:
1. ESCLUSIVITÀ DELLE FONTI: Il piano deve essere basato SOLO ed ESCLUSIVAMENTE sui concetti, capitoli, paragrafi e argomenti EFFETTIVAMENTE PRESENTI nei documenti forniti. Non aggiungere o trattare argomenti che non siano presenti nei testi caricati.
2. ORGANIZZAZIONE LOGICA: Organizza gli argomenti secondo un ordine didattico progressivo, logico e propedeutico (dai concetti base agli approfondimenti).
3. MODULARITÀ: Per ogni giorno crea un tema principale ("dayTitle") e una lista di argomenti specifici ("topics") che contengano titoli chiari e precisi estratti dal materiale. Non usare duplicazioni o suffissi artificiali come "Parte 1" o "Parte 2".
4. FORMATO DI RISPOSTA: Restituisci ESCLUSIVAMENTE un array JSON valido con questa struttura (nessun testo prima o dopo):
[
  {
    "dayNumber": 1,
    "dayTitle": "Giorno 1: Titolo tema principale estratto dalle fonti",
    "phase": "Fase 1: Studio e Comprensione",
    "topics": [
      {
        "id": "d1_t1",
        "title": "Titolo specifico e descrittivo del primo argomento reale",
        "difficulty": "Base"
      }
    ]
  }
]`;

      const syllabusUserPrompt = `Materia/Descrizione esame: "${examDescription || 'Materia principale'}".
Numero di giorni disponibili per lo studio: ${numDays}.
Livello di preparazione desiderato: ${prepLevel || 80}%.
Stile di studio: ${languageStyle || 'automatico'}.
Tipo di fonte: ${sourceType === 'my_materials' ? 'USA SOLO I MATERIALI ALLEGATI QUI SOTTO' : 'Ricerca nozioni online'}.

${aggregatedFileText ? `TESTO ESTRATTO DAI DOCUMENTI DELL'UTENTE:\n${aggregatedFileText.slice(0, 70000)}` : 'Nessun file testuale estratto, basati sulla descrizione accademica.'}

Genera il piano di studio JSON rigorosamente aderente ai materiali forniti.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: syllabusSystemPrompt },
          { role: 'user', content: syllabusUserPrompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const rawResponse = completion.choices[0]?.message?.content || '{}';
      let parsed = {};
      try {
        parsed = JSON.parse(rawResponse);
        // Normalizza struttura se wrappata in un campo tipo { "schedule": [...] } o { "days": [...] }
        if (parsed.schedule && Array.isArray(parsed.schedule)) parsed = parsed.schedule;
        else if (parsed.days && Array.isArray(parsed.days)) parsed = parsed.days;
        else if (Array.isArray(parsed)) parsed = parsed;
        else if (typeof parsed === 'object') {
          const firstArray = Object.values(parsed).find(val => Array.isArray(val));
          if (firstArray) parsed = firstArray;
        }
      } catch (err) {
        console.error("Errore parsing JSON syllabus:", err);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: Array.isArray(parsed) && parsed.length > 0 ? parsed : null }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 2: GENERAZIONE LEZIONE RIGOROSA BASATA SULLE FONTI
    // -------------------------------------------------------------
    if (isLessonGeneration) {
      const isStrict = sourceType === 'my_materials';
      const lessonSystemPrompt = `Sei un docente universitario e tutor accademico di altissimo livello.
Il tuo compito è generare una lezione/riassunto specialistico, chiaro, altamente logico e pedagogico sull'argomento richiesto.

${isStrict ? `REGOLA ASSOLUTA E INDEROGABILE:
Devi spiegare l'argomento basandoti UNICAMENTE ED ESCLUSIVAMENTE sulle informazioni, spiegazioni, definizioni e concetti PRESENTI NEI DOCUMENTI ALLEGATI.
NON aggiungere nozioni esterne da internet o elementi non presenti nel materiale caricato dallo studente.
Il tuo compito è rendere il materiale già esistente molto più chiaro, ordinato, logico, schematizzato e facile da apprendere, senza alterarne il contenuto o aggiungere informazioni inventate.` : `Attingi alle migliori nozioni scientifiche e accademiche di riferimento.`}

FORMATTAZIONE E STRUTTURA:
- Utilizza titoli e sottotitoli in Markdown (##, ###).
- Evidenzia SEMPRE i termini chiave e i concetti fondamentali in GRASSETTO (**parola**).
- Usa elenchi puntati strutturati, tabelle comparative e sintesi per punti.
- Per qualsiasi formula scientifica, chimica, biologica, medica o statistica, USA LA NOTAZIONE LaTeX standard racchiusa tra $ (in linea) oppure $$ (blocco).`;

      const lessonUserPrompt = `Argomento della lezione: "${topicTitle}".
Dettagli esame: "${examDescription || ''}", Livello target: ${prepLevel || 80}%, Stile: ${languageStyle || 'automatico'}.

${aggregatedFileText ? `FONTI E DOCUMENTI DELLO STUDENTE:\n${aggregatedFileText.slice(0, 80000)}` : ''}

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
Rispondi in modo chiaro, approfondito e pedagogico.
Usa formattazione Markdown ricca con titoli (##), grassetto (**testo**) per i punti salienti, elenchi ed equazioni LaTeX in $ o $$ quando utili.`;

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
    if (aggregatedFileText) {
      finalPromptText += `\n\n--- DOCUMENTI ALLEGATI DALL'UTENTE ---${aggregatedFileText}`;
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
