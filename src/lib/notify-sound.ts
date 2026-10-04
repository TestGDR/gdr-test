"use client";

// Rintocco d'avviso per i messaggi non letti, creato dal browser (nessun file audio).
// I browser non lasciano suonare una pagina finche' l'utente non ha cliccato o
// premuto un tasto almeno una volta: fino ad allora il suono resta in attesa.

let ctx: AudioContext | null = null;

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  return ctx;
}

// Al primo clic o tasto il suono si sblocca
if (typeof window !== "undefined") {
  const unlock = () => {
    audio()?.resume();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

// Due rintocchi di campanella, brevi e non troppo forti
export function playMessageChime() {
  const ac = audio();
  if (!ac || ac.state !== "running") return;
  const now = ac.currentTime;
  [
    [880, 0],
    [1318.5, 0.16],
  ].forEach(([freq, delay]) => {
    const osc = ac.createOscillator();
    const overtone = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    overtone.type = "sine";
    osc.frequency.value = freq;
    overtone.frequency.value = freq * 2.76; // armonico da campana
    const start = now + delay;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
    const soft = ac.createGain();
    soft.gain.value = 0.25; // l'armonico piu' piano della nota
    osc.connect(gain);
    overtone.connect(soft);
    soft.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    overtone.start(start);
    osc.stop(start + 1);
    overtone.stop(start + 1);
  });
}

// Ripete una funzione a intervalli anche con la scheda in secondo piano: i timer
// della pagina vengono rallentati dal browser (fino a una volta al minuto), quelli
// di un Web Worker no. Restituisce la funzione per fermarlo.
export function everyEvenInBackground(fn: () => void, ms: number): () => void {
  if (typeof window === "undefined") return () => {};
  try {
    const src = `setInterval(function () { postMessage(0); }, ${Math.max(1000, Math.round(ms))});`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const worker = new Worker(url);
    worker.onmessage = () => fn();
    return () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const timer = setInterval(fn, ms);
    return () => clearInterval(timer);
  }
}
