"use client";

import DOMPurify from "dompurify";
import { useMemo } from "react";

// Pagina Principale scritta dal giocatore in HTML e CSS.
// Doppia protezione contro l'HTML dannoso:
// 1. DOMPurify toglie script, eventi (onclick...), javascript:, moduli, iframe e simili
// 2. la pagina gira in un iframe isolato (sandbox senza script, origine separata)
//    con una Content-Security-Policy che permette solo immagini https, stili e font:
//    il CSS non puo' uscire dal riquadro ne' toccare il resto del sito
const CSP =
  "default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:";

export const SHEET_HTML_MAX = 30000;

export function cleanSheetHtml(html: string) {
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(html, {
    FORCE_BODY: true, // tiene i <style> messi all'inizio
    ADD_TAGS: ["style"],
    FORBID_TAGS: [
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

export default function SheetHtml({
  html,
  title,
}: {
  html: string;
  title: string;
}) {
  const doc = useMemo(
    () => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<base target="_blank">
<style>html,body{margin:0;min-height:100%;background:#0d0b0b;color:#e4dfdb;font-family:Georgia,serif}img{max-width:100%}a{color:#c9a45c}</style>
</head><body>${cleanSheetHtml(html)}</body></html>`,
    [html],
  );
  return (
    <iframe
      title={title}
      srcDoc={doc}
      // niente allow-scripts e niente allow-same-origin: nessun codice gira e la pagina non vede il sito
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className="block h-full w-full border-0"
    />
  );
}
