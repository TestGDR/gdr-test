// Mentre il server prepara la pagina richiesta (chat, mappa, casata...) si vede
// subito questo segnale, invece di restare fermi sulla pagina di prima.
// Next lo scarica in anticipo insieme ai link, quindi compare all'istante.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent/25 border-t-accent" aria-hidden />
      <span className="font-serif text-sm tracking-[0.2em] uppercase">Caricamento...</span>
    </div>
  );
}
