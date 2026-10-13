// Controlli periodici che non serve ripetere a ogni caricamento di pagina
// (stipendio del giorno, gravidanze, compleanni): al massimo una volta ogni
// mezz'ora per browser. Il database resta l'unico a decidere che cosa fare.
const EVERY_MS = 30 * 60 * 1000;
const PREFIX = "westeros-controllo:";

// E' ora di rifare il controllo? (senza memoria del browser: sempre si')
export function isDue(key: string): boolean {
  try {
    const last = Number(localStorage.getItem(PREFIX + key));
    return !last || Date.now() - last > EVERY_MS;
  } catch {
    return true;
  }
}

// Da chiamare quando il controllo e' riuscito
export function markDone(key: string) {
  try {
    localStorage.setItem(PREFIX + key, String(Date.now()));
  } catch {
    // memoria del browser non disponibile: si rifara' al prossimo caricamento
  }
}
