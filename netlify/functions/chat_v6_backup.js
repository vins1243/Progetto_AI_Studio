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

    // Estrazione del testo ottimizzata per evitare timeout e payload pesanti
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
              // Estraiamo le prime 25 pagine (contengono indice, capitoli e concetti chiave) per massima velocità
              const pdfData = await pdfParse(buffer, { max: 25 });
              const cleanText = pdfData.text ? pdfData.text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').slice(0, 35000) : '';
              aggregatedFileText += `\n\n=== DOCUMENTO PDF: ${f.name} (Indice e Capitoli) ===\n${cleanText}\n=== FINE ESTRATTO ===\n`;
            } else {
              const textContent = buffer.toString('utf-8').slice(0, 35000);
              aggregatedFileText += `\n\n=== DOCUMENTO TESTO: ${f.name} ===\n${textContent}\n=== FINE DOCUMENTO ===\n`;
            }
          } catch (err) {
            console.error(`Errore estrazione testo per ${f.name}:`, err);
            aggregatedFileText += `\n\n[File allegato: ${f.name}]\n`;
          }
        }
      }
    }

    // -------------------------------------------------------------
    // AZIONE 1: GENERAZIONE SYLLABUS RAPIDA E BASATA SULLE FONTI REALI
    // -------------------------------------------------------------
    if (action === 'generate_syllabus') {
      const numDays = Math.max(3, Math.min(daysTotal || 30, 45));

      const syllabusSystemPrompt = `Sei un esperto accademico e professore universitario.
Analizza il testo/indice dei documenti caricati dallo studente e crea un piano di studio organizzato per ${numDays} giorni.

REGOLE ASSOLUTE:
1. BASATI ESCLUSIVAMENTE sui capitoli, argomenti e concetti presenti nei documenti forniti. Non aggiungere nozioni esterne.
2. Crea una progressione didattica logica. Ogni giorno ha un tema ("dayTitle") e 1 o 2 argomenti specifici ("topics").
3. Niente suffissi artificiali come "Parte 1" o "Parte 2". Titoli chiari ed esaustivi.
4. Restituisci SOLO un JSON valido con la chiave "schedule" contenente la lista dei giorni:
{
  "schedule": [
    {
      "dayNumber": 1,
      "dayTitle": "Giorno 1: Titolo modulo estratto dalle fonti",
      "phase": "Fase 1: Studio e Comprensione",
      "topics": [
        {
          "id": "d1_t1",
          "title": "Titolo specifico dell'argomento estratto dal testo",
          "difficulty": "Base"
        }
      ]
    }
  ]
}`;

      const syllabusUserPrompt = `Materia: "${examDescription || 'Materia di Studio'}". Giorni: ${numDays}. Obiettivo: ${prepLevel || 80}%.
Fonti caricate dallo studente:
${aggregatedFileText || `Materia: ${examDescription}`}

Genera il piano di studio JSON rigorosamente basato sulle fonti.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
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
        body: JSON.stringify({ schedule: Array.isArray(parsed) && parsed.length > 0 ? parsed : null }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 2: GENERAZIONE LEZIONE RIGOROSA
    // -------------------------------------------------------------
    if (isLessonGeneration) {
      const isStrict = sourceType === 'my_materials';
      const lessonSystemPrompt = `Sei un docente universitario e tutor accademico di altissimo livello.
Il tuo compito è spiegare in modo chiaro, approfondito e perfettamente strutturato l'argomento richiesto.

${isStrict ? `REGOLA INDEROGABILE:
Devi basarti UNICAMENTE ed ESCLUSIVAMENTE sulle informazioni e spiegazioni PRESENTI NEI DOCUMENTI ALLEGATI.
NON inventare e non aggiungere nozioni esterne da internet.
Riorganizza il materiale, rendilo logico, chiaro e schematizzato.` : `Attingi alle migliori nozioni accademiche e scientifiche di riferimento.`}

FORMATTAZIONE:
- Titoli in Markdown (##, ###).
- Parole e concetti chiave in GRASSETTO (**parola**).
- Elenchi puntati e tabelle comparative.
- Formule matematiche, chimiche o scientifiche in notazione LaTeX ($formula$ o $$formula$$).`;

      const lessonUserPrompt = `Argomento: "${topicTitle}". Materia: "${examDescription || ''}".

FONTI DELLO STUDENTE:
${aggregatedFileText || 'Nessun file testuale allegato.'}

Scrivi una lezione accademica chiara, dettagliata ed esaustiva.`;

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
    if (aggregatedFileText) {
      finalPromptText += `\n\n--- DOCUMENTI ALLEGATI ---\n${aggregatedFileText}`;
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
