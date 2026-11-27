# MinervaAI — Piattaforma di Studio AI (Scuole Superiori & Università)

Web app React + Vite + Tailwind CSS con backend serverless **Netlify Functions v2** (Streaming SSE), **Google Gemini** (`gemini-2.5-flash` per task leggeri, `gemini-2.5-pro` per compendi e valutazioni complesse, con fallback automatico OpenAI), **Supabase** (Auth + Cloud Sync + Quote mensili RLS) e **Stripe** (Checkout + Webhook + Customer Portal).

---

## Configurazione Produzione (3 passaggi)

### 1. Database Supabase
Apri **Supabase Dashboard → SQL Editor**, incolla ed esegui l'intero contenuto di [`supabase/schema.sql`](supabase/schema.sql).
Lo script crea/aggiorna le tabelle `profiles`, `projects` (con `lessons_content` e `concept_maps`) e `conversations`, il trigger di creazione profilo al signup, le policy **RLS** e il trigger anti-manomissione delle colonne di fatturazione.

### 2. Variabili d'ambiente su Netlify
In **Netlify → Site configuration → Environment variables**, imposta:

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `GEMINI_API_KEY` | Sì (consigliata) | Chiave API Google Gemini (`gemini-2.5-flash` + `gemini-2.5-pro`) |
| `OPENAI_API_KEY` | Opzionale | Chiave OpenAI usata come fallback automatico se Gemini non è disponibile |
| `SUPABASE_URL` | Sì | URL del progetto Supabase (`https://...supabase.co`) |
| `SUPABASE_ANON_KEY` | Sì | Chiave pubblica (publishable/anon) di Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sì | Chiave segreta `service_role` di Supabase (solo lato server, per quote e webhook Stripe) |
| `STRIPE_SECRET_KEY` | Sì (per pagamenti) | Chiave segreta Stripe (`sk_live_...` o `sk_test_...`) |
| `STRIPE_PRICE_ID` | Sì (per pagamenti) | ID del prezzo ricorrente mensile 14,99 € (`price_...`) |
| `STRIPE_WEBHOOK_SECRET` | Sì (per pagamenti) | Signing secret del webhook Stripe (`whsec_...`) |
| `SITE_URL` | Consigliata | URL pubblico del sito (es. `https://tuodominio.it`) |

### 3. Webhook Stripe
In **Stripe Dashboard → Developers → Webhooks → Add endpoint**:
* **Endpoint URL**: `https://<tuo-dominio>/.netlify/functions/stripe-webhook`
* **Eventi da ascoltare**:
  * `checkout.session.completed`
  * `customer.subscription.updated`
  * `customer.subscription.deleted`
  * `invoice.payment_failed`

---

## Sviluppo locale

```bash
npm install
npm run dev
```
