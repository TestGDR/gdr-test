// Service worker dell'app installabile. Non salva nulla in memoria: il gioco
// e' sempre in diretta, quindi ogni richiesta va al sito come prima. Serve solo
// a rendere il sito installabile e a mostrare un avviso se manca la connessione.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const OFFLINE = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Westeros GDR</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#0b0a0a;color:#e4dfdb;font-family:Georgia,serif;text-align:center;padding:24px}
button{margin-top:16px;padding:8px 18px;background:#5a1414;color:#fff;border:1px solid #8b2a14;
border-radius:6px;font-size:16px;cursor:pointer}</style></head>
<body><div><h1 style="color:#d4b394;font-weight:normal">Westeros GDR</h1>
<p>Nessuna connessione a internet.</p><p>Controlla la rete e riprova.</p>
<button onclick="location.reload()">Riprova</button></div></body></html>`;

// Solo le pagine: se la rete non risponde, la pagina di avviso
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
