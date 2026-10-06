"use client";

// Suoni d'avviso creati dal browser (nessun file audio).
// I browser non lasciano suonare una pagina finche' l'utente non ha cliccato o
// premuto un tasto almeno una volta: fino ad allora il suono resta in attesa.
// Quale suono usare (missive ON, messaggi OFF, chat), il volume e se i suoni
// sono accesi lo decidono le preferenze dell'utente (scheda -> Opzioni, lib/prefs.ts).

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

// ---------------------------------------------------------------------
// Libreria dei suoni: ognuno e' una sequenza di note
// ---------------------------------------------------------------------
type Note = {
  f: number; // frequenza (Hz); con noise e' il centro del filtro
  t: number; // quando parte (secondi dall'inizio)
  d: number; // quanto dura
  type?: OscillatorType;
  g?: number; // volume della nota (0-1)
  attack?: number; // secondi per arrivare al massimo
  over?: number; // armonico da campana (moltiplicatore)
  partials?: number[]; // altri suoni insieme, in moltiplicatori (metallo, gong)
  slide?: number; // frequenza a cui scivola alla fine
  noise?: boolean; // rumore filtrato (carta, colpi, fruscii)
  filter?: { type: BiquadFilterType; f: number; q?: number };
};

export type SoundGroup = "missiva" | "off" | "chat";
// group: la lista (o le liste) dove si puo' scegliere. file: un suono registrato
// (cartella public/sounds) al posto delle note
export type SoundDef = { id: string; label: string; group: SoundGroup | SoundGroup[]; notes: Note[]; file?: string };

export const SOUNDS: SoundDef[] = [
  // ---- Missive ON: solo i suoni registrati (vedi in fondo) ----

  // ---- Messaggi OFF e ticket: solo i suoni registrati (vedi in fondo) ----

  // ---- Suoni registrati (public/sounds) ----
  // missive ON
  { id: "file-corvo", label: "Corvo", group: "missiva", notes: [], file: "/sounds/raven.mp3" },
  { id: "file-campana", label: "Campana", group: "missiva", notes: [], file: "/sounds/campana.mp3" },
  { id: "file-porta", label: "Porta", group: "missiva", notes: [], file: "/sounds/porta.mp3" },
  // messaggi OFF e ticket
  { id: "file-bip1", label: "Bip 1", group: "off", notes: [], file: "/sounds/bip1.mp3" },
  { id: "file-blip", label: "Blip", group: "off", notes: [], file: "/sounds/blip.mp3" },
  { id: "file-bip3", label: "Bip 3", group: "off", notes: [], file: "/sounds/bip3.mp3" },
  // chat
  { id: "file-chat1", label: "Chat 1", group: "chat", notes: [], file: "/sounds/chat1.mp3" },
  { id: "file-chat2", label: "Chat 2", group: "chat", notes: [], file: "/sounds/chat2.mp3" },
  { id: "file-chat3", label: "Chat 3", group: "chat", notes: [], file: "/sounds/chat3.mp3" },
];

export const soundsOf = (group: SoundGroup) => SOUNDS.filter((s) => [s.group].flat().includes(group));
// Se un suono salvato non esiste piu', vale il primo della sua lista
export const soundOr = (id: string, group: SoundGroup) => (soundsOf(group).some((s) => s.id === id) ? id : soundsOf(group)[0].id);

// Volume generale (0-1), dalle preferenze
let volume = 0.8;

function playNotes(notes: Note[]) {
  const ac = audio();
  if (!ac || ac.state !== "running" || volume <= 0) return;
  const now = ac.currentTime + 0.02;
  // uscita comune: volume scelto e un limitatore, cosi' i suoni forti non gracchiano
  const master = ac.createGain();
  master.gain.value = volume;
  const limiter = ac.createDynamicsCompressor();
  master.connect(limiter);
  limiter.connect(ac.destination);

  for (const n of notes) {
    const start = now + n.t;
    const gain = ac.createGain();
    const peak = n.g ?? 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + (n.attack ?? 0.01));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.d);
    let out: AudioNode = gain;
    if (n.filter) {
      const filter = ac.createBiquadFilter();
      filter.type = n.filter.type;
      filter.frequency.value = n.filter.f;
      if (n.filter.q) filter.Q.value = n.filter.q;
      gain.connect(filter);
      out = filter;
    }
    out.connect(master);

    if (n.noise) {
      const len = Math.max(1, Math.ceil(ac.sampleRate * n.d));
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buf;
      if (!n.filter) {
        const band = ac.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = n.f || 900;
        src.connect(band);
        band.connect(gain);
      } else src.connect(gain);
      src.start(start);
      src.stop(start + n.d);
      continue;
    }

    const tones: [number, number][] = [[1, 1]]; // [moltiplicatore, volume relativo]
    if (n.over) tones.push([n.over, 0.25]);
    for (const p of n.partials ?? []) tones.push([p, 0.35]);
    for (const [mult, rel] of tones) {
      const osc = ac.createOscillator();
      osc.type = mult === 1 ? (n.type ?? "sine") : "sine";
      osc.frequency.setValueAtTime(n.f * mult, start);
      if (n.slide) osc.frequency.exponentialRampToValueAtTime(n.slide * mult, start + n.d);
      const level = ac.createGain();
      level.gain.value = rel;
      osc.connect(level);
      level.connect(gain);
      osc.start(start);
      osc.stop(start + n.d + 0.05);
    }
  }
}

// Suona un suono preciso (pulsante "prova" delle Opzioni): suona anche con i suoni spenti
export function playSound(id: string) {
  const s = SOUNDS.find((x) => x.id === id);
  if (!s) return;
  if (s.file) return playFile(s.file);
  playNotes(s.notes);
}

// Suono registrato, con il volume scelto (i browser lo bloccano finche' non si e'
// cliccato almeno una volta: in quel caso non suona e basta)
function playFile(src: string) {
  if (typeof window === "undefined" || volume <= 0) return;
  const a = new Audio(src);
  a.volume = volume;
  a.play().catch(() => {});
}

// ---------------------------------------------------------------------
// Preferenze dei suoni (impostate da lib/prefs.ts)
// ---------------------------------------------------------------------
let soundPrefs = { on: true, missiva: "file-corvo", off: "file-bip1", chat: "file-chat1", chatOn: true };
export function setSoundPrefs(p: typeof soundPrefs & { volume: number }) {
  const { volume: v, ...rest } = p;
  soundPrefs = rest;
  volume = Math.min(1, Math.max(0, v / 100));
}

// Suono di un avviso, secondo le preferenze (niente se i suoni sono spenti)
export function playEvent(kind: "missiva" | "off" | "chat") {
  if (!soundPrefs.on) return;
  if (kind === "chat" && !soundPrefs.chatOn) return;
  playSound(soundOr(soundPrefs[kind], kind));
}

// Avviso dei messaggi non letti (OFF, ticket): il suono scelto per gli OFF
export function playMessageChime() {
  playEvent("off");
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
