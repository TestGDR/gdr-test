import type { MetadataRoute } from "next";

// App installabile (Chrome: "Installa Westeros GDR" nella barra dell'indirizzo,
// sul telefono "Aggiungi a schermata Home"): si apre in una finestra sua, senza
// la barra del browser, e parte dalla mappa (chi non e' entrato va al login)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Westeros GDR",
    short_name: "Westeros GDR",
    description: "Gioco di ruolo play by chat amatoriale ambientato a Westeros",
    lang: "it",
    start_url: "/mappa",
    scope: "/",
    display: "standalone",
    background_color: "#0b0a0a",
    theme_color: "#0b0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
