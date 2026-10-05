"use client";

import DOMPurify from "dompurify";

// Testo scritto dal giocatore con l'editor ("Si sa che", "Affetti"): resta la
// formattazione (grassetto, colori, titoli, immagini https), spariscono script,
// eventi, javascript:, moduli, iframe e <style> (che cambierebbe tutto il sito).
// Va mostrato in un contenitore con "contain: paint", cosi' nemmeno uno stile
// position: fixed puo' uscire dalla pagina della scheda.
export function cleanPlayerHtml(html: string) {
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "style",
      "script",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "iframe",
      "frame",
      "object",
      "embed",
      "base",
      "meta",
      "link",
    ],
    FORBID_ATTR: ["action", "formaction", "srcdoc"],
  });
}
