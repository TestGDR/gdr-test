# GDR Play By Chat

Web app per giochi di ruolo play by chat: i giocatori creano personaggi, si muovono su una mappa
e, cliccando sui luoghi, entrano nelle **liste** (chat testuali in tempo reale) dove descrivono
cosa fanno e dicono i loro personaggi.

**Stack:** Next.js 16 (App Router) · Supabase (database, autenticazione, realtime) · Tailwind CSS · Vercel

## Struttura

| Percorso | Cosa fa |
| --- | --- |
| `src/app/login` | Registrazione e accesso (email + password) |
| `src/app/personaggi` | Creazione e gestione dei propri personaggi |
| `src/app/mappa` | Mappa con i punti cliccabili dei luoghi |
| `src/app/luogo/[id]` | Scheda del luogo con l'elenco delle sue liste |
| `src/app/chat/[id]` | La lista: chat in tempo reale + elenco dei presenti |
| `src/proxy.ts` | Rinnova la sessione e protegge le pagine riservate |
| `supabase/migrations/0001_schema.sql` | Tabelle, sicurezza (RLS), realtime |
| `supabase/seed.sql` | Mappa di esempio con luoghi e liste |

### Modello dati

`profiles` (utenti, con ruolo `player` / `master` / `admin`) → `characters` (personaggi) ·
`maps` → `locations` (punti sulla mappa, coordinate x/y in %) → `rooms` (liste) → `messages`.

All'**iscrizione** si sceglie il nome del primo personaggio (univoco in tutto il gioco, senza
distinzione tra maiuscole e minuscole), l'email e la password. La password è gestita da Supabase
Auth, che ne salva solo l'hash bcrypt; email e password non vengono mai copiate nelle tabelle
pubbliche.

Il **registro accessi** (`access_logs`) salva IP, paese, user agent e l'esito del controllo
VPN/proxy/TOR/datacenter (via [proxycheck.io](https://proxycheck.io)) a ogni iscrizione, login e
cambio di IP. È visibile solo agli admin nella pagina `/admin/accessi`, che segnala anche gli IP
condivisi da più account.

I messaggi hanno tre tipi: **azione** (gioco), **fuori_gioco** (OFF) e **master** (narrazione,
solo staff). Il parlato scritto tra «caporali» o "virgolette" viene evidenziato.

## Configurazione

### 1. Supabase

1. Crea un progetto su [supabase.com](https://supabase.com).
2. **SQL Editor** → incolla ed esegui, in ordine, `supabase/migrations/0001_schema.sql`,
   `supabase/seed.sql` e `supabase/migrations/0002_iscrizione_e_accessi.sql`.
3. **Project Settings → API Keys**: copia *Project URL*, *Publishable key* e *Secret key*
   (quest'ultima va solo in `.env.local` e nelle variabili di Vercel, mai su GitHub).
4. (Consigliato durante lo sviluppo) **Authentication → Sign In / Providers → Email**:
   disattiva *Confirm email* per registrarti senza conferma via mail.
5. **Authentication → URL Configuration**: imposta *Site URL* con l'indirizzo Vercel e aggiungi
   `http://localhost:3000/**` e `https://<tuo-progetto>.vercel.app/**` ai *Redirect URLs*.

Per **eliminare un utente** usa **Authentication → Users → Delete user**: cancella account,
profilo, personaggi e messaggi insieme. Cancellare solo la riga in `profiles` lascia l'account
(email e password) in `auth.users` e l'email risulta ancora "già registrata".

Per rendere un utente master/admin: **Table Editor → profiles** → cambia `role`.
Nuovi luoghi e liste si aggiungono da **Table Editor** (`locations` con coordinate x/y in
percentuale sull'immagine della mappa, `rooms` collegate al luogo).

### 2. In locale

```bash
cp .env.example .env.local   # e inserisci URL e chiave di Supabase
npm install
npm run dev                  # http://localhost:3000
```

### 3. GitHub + Vercel

1. Crea un repository vuoto su GitHub e fai il push di questo progetto.
2. Su [vercel.com](https://vercel.com) → **Add New → Project** → importa il repository.
3. In **Environment Variables** aggiungi `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (marcata *Sensitive*) e,
   facoltativa, `PROXYCHECK_API_KEY`, poi **Deploy**.

Da quel momento ogni push su `main` viene pubblicato automaticamente.
