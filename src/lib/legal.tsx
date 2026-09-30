import type { ReactNode } from "react";

// ATTENZIONE: questi testi sono BOZZE da completare (parti tra [PARENTESI QUADRE])
// e da far verificare da un professionista prima dell'apertura al pubblico.
// Quando cambi un documento in modo sostanziale, aggiorna LEGAL_VERSION:
// ogni profilo salva la versione accettata all'iscrizione.
export const LEGAL_VERSION = "2026-09-30";

const TITOLARE = "[NOME E COGNOME DEL TITOLARE / NOME ASSOCIAZIONE]";
const CONTATTO = "[EMAIL DI CONTATTO]";

export type LegalDocId = "disclaimer" | "termini" | "privacy" | "cookie";

export type LegalDoc = { id: LegalDocId; title: string; body: ReactNode };

function H({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 mb-2 font-serif text-lg text-accent">{children}</h3>;
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  disclaimer: {
    id: "disclaimer",
    title: "Disclaimer",
    body: (
      <>
        <p>
          Questo sito ospita un gioco di ruolo testuale &quot;play by chat&quot;. Personaggi, luoghi
          ed eventi sono frutto della fantasia degli utenti: ogni riferimento a persone, fatti o
          luoghi reali è puramente casuale.
        </p>
        <H>Contenuti degli utenti</H>
        <p>
          I testi pubblicati nelle liste sono scritti dai giocatori, che ne sono gli unici
          responsabili. Lo staff modera il gioco ma non può verificare in anticipo ogni messaggio.
          Se trovi contenuti inappropriati scrivi a {CONTATTO}.
        </p>
        <H>Temi trattati</H>
        <p>
          Il gioco può trattare temi maturi (violenza, conflitti, argomenti drammatici) sempre in
          chiave narrativa. Per questo la registrazione è riservata ai maggiorenni.
        </p>
        <H>Nessuna garanzia</H>
        <p>
          Il servizio è offerto gratuitamente e &quot;così com&apos;è&quot;, senza garanzia di
          disponibilità continua. Il gestore non risponde di interruzioni, perdite di dati o danni
          derivanti dall&apos;uso del sito, nei limiti consentiti dalla legge.
        </p>
      </>
    ),
  },

  termini: {
    id: "termini",
    title: "Termini del servizio",
    body: (
      <>
        <p>
          Registrandoti accetti le seguenti regole. Il servizio è gestito da {TITOLARE}.
        </p>
        <H>1. Account</H>
        <p>
          Ogni persona può avere un solo account. L&apos;account è personale: non condividere la
          password e non cedere l&apos;account ad altri. Sei responsabile di ciò che avviene con le
          tue credenziali.
        </p>
        <H>2. Personaggi</H>
        <p>
          Il nome del personaggio deve essere unico, adatto all&apos;ambientazione e non offensivo.
          Lo staff può chiedere di cambiare nomi non appropriati.
        </p>
        <H>3. Comportamento</H>
        <p>
          È vietato pubblicare contenuti illegali, offensivi, discriminatori, pubblicità o spam, dati
          personali di altre persone e contenuti che violano diritti d&apos;autore. Rispetta gli altri
          giocatori e le indicazioni dei master.
        </p>
        <H>4. Sicurezza e multi-account</H>
        <p>
          Per prevenire abusi e account multipli vengono registrati gli indirizzi IP di accesso e
          viene verificato se provengono da VPN, proxy o reti anonime (vedi Privacy Policy). L&apos;uso
          di più account o l&apos;elusione di un ban possono portare alla sospensione.
        </p>
        <H>5. Sanzioni</H>
        <p>
          In caso di violazione lo staff può rimuovere contenuti, sospendere o chiudere
          l&apos;account, anche senza preavviso nei casi gravi.
        </p>
        <H>6. Modifiche</H>
        <p>
          Questi termini possono essere aggiornati. Le modifiche sostanziali saranno comunicate sul
          sito e potrà esserti chiesto di accettarle di nuovo.
        </p>
      </>
    ),
  },

  privacy: {
    id: "privacy",
    title: "Privacy Policy",
    body: (
      <>
        <p>
          Informativa ai sensi degli artt. 13-14 del Regolamento UE 2016/679 (GDPR).
        </p>
        <H>Titolare del trattamento</H>
        <p>
          {TITOLARE} — contatto: {CONTATTO}.
        </p>
        <H>Dati raccolti</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>Email e password (la password è salvata solo in forma cifrata irreversibile, hash).</li>
          <li>Nome e descrizione dei personaggi, messaggi scritti nelle liste.</li>
          <li>
            Dati di accesso: indirizzo IP, browser/dispositivo (user agent), paese stimato, data e
            ora, esito della verifica VPN/proxy/TOR.
          </li>
          <li>Data e versione dei documenti accettati e dichiarazione di maggiore età.</li>
        </ul>
        <H>Finalità e basi giuridiche</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>Creare e gestire l&apos;account e permettere il gioco — esecuzione del servizio (art. 6.1.b).</li>
          <li>
            Sicurezza del sito, prevenzione di abusi e account multipli tramite i dati di accesso —
            legittimo interesse del titolare (art. 6.1.f).
          </li>
          <li>Adempimenti di legge e tutela dei diritti in caso di contestazioni (art. 6.1.c e 6.1.f).</li>
        </ul>
        <H>Fornitori che trattano i dati</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase — database e autenticazione (server nell&apos;Unione Europea).</li>
          <li>Vercel — hosting del sito (può trattare dati negli USA con garanzie EU-US Data Privacy Framework).</li>
          <li>proxycheck.io — verifica degli indirizzi IP (Regno Unito, paese con decisione di adeguatezza UE).</li>
        </ul>
        <H>Conservazione</H>
        <p>
          I dati dell&apos;account restano finché l&apos;account è attivo. I dati di accesso (IP e
          verifiche) sono conservati per [6 MESI] e poi cancellati. I messaggi di gioco possono
          restare visibili nelle liste anche dopo la chiusura dell&apos;account, salvo richiesta di
          cancellazione.
        </p>
        <H>I tuoi diritti</H>
        <p>
          Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità dei dati e
          opporti al trattamento scrivendo a {CONTATTO}. Puoi inoltre presentare reclamo al Garante
          per la protezione dei dati personali (www.garanteprivacy.it).
        </p>
        <H>Minori</H>
        <p>Il servizio è riservato ai maggiori di 18 anni.</p>
      </>
    ),
  },

  cookie: {
    id: "cookie",
    title: "Cookie Policy",
    body: (
      <>
        <p>
          Questo sito usa <strong>solo cookie tecnici</strong>, necessari al funzionamento. Non usa
          cookie di profilazione, pubblicità o statistiche di terze parti, quindi non è richiesto il
          tuo consenso preventivo (Linee guida del Garante Privacy, 10 giugno 2021).
        </p>
        <H>Cookie utilizzati</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code>sb-…-auth-token</code> — mantiene l&apos;accesso al tuo account (Supabase). Durata:
            fino al logout o alla scadenza della sessione.
          </li>
          <li>
            <code>gdr_access</code> — sicurezza: evita di registrare più volte lo stesso accesso
            dallo stesso indirizzo IP. Durata: fino alla chiusura del browser.
          </li>
        </ul>
        <H>Come gestirli</H>
        <p>
          Puoi cancellare i cookie dalle impostazioni del browser; senza cookie tecnici non è
          possibile restare collegati al gioco.
        </p>
      </>
    ),
  },
};
