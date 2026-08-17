import OpenAI from 'openai';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, history, file, files, sourceType, isLessonGeneration, topicTitle } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Chiave OPENAI_API_KEY non configurata su Netlify.' }),
      };
    }

    const openai = new OpenAI({ apiKey });

    // Definizione del System Prompt in base alla modalità
    let systemInstruction = '';
    if (isLessonGeneration) {
      if (sourceType === 'my_materials') {
        systemInstruction = `Sei un professore universitario e tutor accademico di altissimo livello.
Il tuo compito è generare una lezione/riassunto specialistico, chiaro, pedagogico e approfondito esclusivamente sul tema richiesto.

REGOLE RIGIDE E CRUCIALI:
1. FONTI ESCLUSIVE: Devi basarti UNICAMENTE ed ESCLUSIVAMENTE sui testi, capitoli e materiali caricati dallo studente forniti nel prompt. NON attingere a fonti esterne da internet e non aggiungere argomenti non presenti o non deducibili dalle fonti fornite.
2. FORMATTAZIONE AVANZATA: Utilizza una ricca formattazione Markdown:
   - Titoli di sezione chiari (es. ## Introduzione, ## Meccanismi Chiave, ## Quadri Clinico-Morfologici, ## Punti Fondamentali).
   - Evidenzia SEMPRE i termini tecnici e i concetti essenziali in GRASSETTO (**termine**).
   - Usa elenchi puntati e numerati per schematizzare passaggi e classificazioni.
   - Utilizza tabelle Markdown quando utile per confronti o classificazioni.
   - Per formule matematiche, chimiche, fisiche o equazioni biologiche/statistiche, USA LA NOTAZIONE LaTeX standard racchiusa tra $formula$ (in linea) oppure $$formula$$ (su blocco separato).`;
      } else {
        systemInstruction = `Sei un professore universitario e tutor accademico di altissimo livello.
Il tuo compito è generare una lezione/riassunto specialistico, chiaro, rigoroso, pedagogico e approfondito sul tema richiesto, attingendo alle nozioni scientifiche e accademiche di riferimento.

FORMATTAZIONE AVANZATA:
- Titoli di sezione chiari (##, ###).
- Evidenzia SEMPRE i termini tecnici e i concetti essenziali in GRASSETTO (**concetto**).
- Usa elenchi puntati strutturati e tabelle di confronto.
- Per formule matematiche, chimiche, fisiche o equazioni, USA LA NOTAZIONE LaTeX standard con $formula$ (in linea) o $$formula$$ (blocco).`;
      }
    } else {
      systemInstruction = `Sei un tutor universitario e assistente allo studio avanzato.
Rispondi in modo chiaro, approfondito e pedagogico.
Usa formattazione Markdown ricca con titoli (##), grassetto (**testo**) per i punti salienti, elenchi ed equazioni LaTeX in $ o $$ quando utili.`;
    }

    const messages = [
      { role: 'system', content: systemInstruction }
    ];

    // Cronologia conversazione se presente
    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text,
        });
      }
    }

    // Gestione file multipli o file singolo
    const allFiles = files && Array.isArray(files) ? files : (file ? [file] : []);
    const imageParts = [];
    let aggregatedFileText = '';

    for (const f of allFiles) {
      if (f && f.base64 && f.mimeType) {
        if (f.mimeType.startsWith('image/')) {
          imageParts.push({
            type: 'image_url',
            image_url: {
              url: f.base64.startsWith('data:') ? f.base64 : `data:${f.mimeType};base64,${f.base64}`,
            },
          });
        } else {
          try {
            const rawBase64 = f.base64.split(',')[1] || f.base64;
            const decoded = Buffer.from(rawBase64, 'base64').toString('utf-8');
            aggregatedFileText += `\n\n--- INIZIO DOCUMENTO: ${f.name} ---\n${decoded}\n--- FINE DOCUMENTO ---\n`;
          } catch (e) {
            aggregatedFileText += `\n\n[File allegato: ${f.name} (${f.size || ''})]`;
          }
        }
      }
    }

    let finalPromptText = prompt || (isLessonGeneration ? `Genera una lezione approfondita e strutturata sull'argomento: "${topicTitle}".` : '');
    if (aggregatedFileText) {
      finalPromptText += `\n\n--- FONTI E MATERIALI CARICATI DALL'UTENTE ---${aggregatedFileText}`;
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
      temperature: 0.4,
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
      body: JSON.stringify({ error: error.message || 'Errore durante la generazione con OpenAI.' }),
    };
  }
};
