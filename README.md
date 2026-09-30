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

I messaggi hanno tre tipi: **azione** (gioco), **fuori_gioco** (OFF) e **master** (narrazione,
solo staff). Il parlato scritto tra «caporali» o "virgolette" viene evidenziato.

## Configurazione

### 1. Supabase

1. Crea un progetto su [supabase.com](https://supabase.com).
2. **SQL Editor** → incolla ed esegui `supabase/migrations/0001_schema.sql`, poi `supabase/seed.sql`.
3. **Project Settings → API Keys**: copia *Project URL* e *Publishable key*.
4. (Consigliato durante lo sviluppo) **Authentication → Sign In / Providers → Email**:
   disattiva *Confirm email* per registrarti senza conferma via mail.
5. **Authentication → URL Configuration**: imposta *Site URL* con l'indirizzo Vercel e aggiungi
   `http://localhost:3000/**` e `https://<tuo-progetto>.vercel.app/**` ai *Redirect URLs*.

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
3. In **Environment Variables** aggiungi `NEXT_PUBLIC_SUPABASE_URL` e
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, poi **Deploy**.

Da quel momento ogni push su `main` viene pubblicato automaticamente.
