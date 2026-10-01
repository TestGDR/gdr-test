// Avviso per chi non ha ancora completato la creazione del personaggio
export default function InactiveBanner() {
  return (
    <div className="mb-4 rounded-md border border-blood/60 bg-blood/15 px-4 py-3 text-sm">
      <strong className="text-orange-200">Il tuo personaggio non è ancora attivo.</strong> Puoi
      esplorare la mappa e leggere la documentazione, ma per giocare nelle chat devi completarne la
      creazione: clicca sul suo nome in alto a destra e poi su <strong>CREA PG</strong>.
    </div>
  );
}
