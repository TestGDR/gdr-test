// =====================================================================
// REGOLAMENTO "Interlock per nobili" - CONFIGURAZIONE
// Tutti i numeri del regolamento (DV, punti, costi, formule, tabelle)
// stanno qui: il motore (engine.ts) li legge e non ne contiene altri.
// Abilita' e tratti invece si gestiscono dal pannello Gestione -> Abilita' e tratti.
// =====================================================================

// Codice interno di una statistica: le 6 di base sono "int", "ref", "body",
// "emp", "pre", "will"; le altre si creano dal pannello (tabella "stats")
export type StatId = string;

export const RULES = {
  // Le 6 statistiche (sezione 1)
  stats: [
    {
      id: "int",
      code: "INT",
      label: "Intelligenza",
      description: "Ragionamento, memoria, percezione",
    },
    {
      id: "ref",
      code: "REF",
      label: "Riflessi",
      description: "Riflessi, coordinazione, mira",
    },
    {
      id: "body",
      code: "BODY",
      label: "Corpo",
      description: "Forza e costituzione",
    },
    {
      id: "emp",
      code: "EMP",
      label: "Empatia",
      description: "Empatia e intuito",
    },
    {
      id: "pre",
      code: "PRE",
      label: "Presenza",
      description: "Presenza, carisma, autorità",
    },
    {
      id: "will",
      code: "WILL",
      label: "Volontà",
      description: "Volontà, coraggio, autocontrollo",
    },
  ] as const satisfies readonly {
    id: StatId;
    code: string;
    label: string;
    description: string;
  }[],
  statMin: 1,
  statMax: 10,
  skillMax: 10,

  // Dado che esplode (sezione 1)
  die: { sides: 10, explodeOn: 10, fumbleOn: 1 },

  // Difficolta' (DV)
  difficulties: [
    {
      id: "facile",
      label: "Facile",
      dv: 10,
      example: "Cavalcare al trotto su terreno battuto",
    },
    {
      id: "normale",
      label: "Normale",
      dv: 15,
      example: "Seguire tracce fresche, calmare un cavallo spaventato",
    },
    {
      id: "difficile",
      label: "Difficile",
      dv: 20,
      example: "Convincere un lord ostile, medicare una ferita grave",
    },
    {
      id: "molto_difficile",
      label: "Molto difficile",
      dv: 25,
      example: "Decifrare un codice di corte, sfondare una porta rinforzata",
    },
    { id: "eroica", label: "Eroica", dv: 30, example: "Imprese da leggenda" },
  ],

  // Creazione del personaggio (sezione 2)
  creation: {
    statPoints: 28, // somma delle 6 statistiche
    statMin: 2,
    statMax: 7,
    skillPoints: 40,
    skillMax: 8, // livello massimo di un'abilita' alla creazione (in gioco 10)
    advantagePoints: 3, // piu' il valore degli svantaggi presi
    flawsMax: 2,
    flawValueMax: 4,
    advantagesMax: 4,
  },

  // Somma dei modificatori dei tratti su un singolo tiro
  traitCap: 3,

  // Onore (sezione 3)
  honor: { start: 5, min: 0, max: 10 },

  // Statistiche derivate (sezione 2)
  derived: {
    hpPerPoint: 10, // HP = 10 x media(BODY, WILL) arrotondata per eccesso
    runPerPoint: 3, // Corsa = media(REF, BODY) x 3
    jumpDivisor: 5, // Salto = Corsa / 5, un quinto da fermo
    carryPerBody: 10, // kg senza malus
    unarmed: [
      { maxBody: 2, damage: "1d6−4" },
      { maxBody: 4, damage: "1d6−2" },
      { maxBody: 6, damage: "1d6" },
      { maxBody: 8, damage: "1d6+2" },
      { maxBody: 10, damage: "1d6+4" },
    ],
  },

  // Combattimento: attacco REF + abilita' d'arma + d10 contro REF + Schivare + d10
  // (a parita' vince chi difende); senza arma si usa Lotta e il danno a mani nude.
  // A 0 PF ferito grave; morto quando i PF scendono a -(PF massimi x deathAtFraction)
  combat: {
    attackStat: "ref",
    defenseStat: "ref",
    defenseSkill: "Schivare",
    unarmedSkill: "Lotta",
    deathAtFraction: 0.5,
  },

  // Esperienza (sezione 8): per salire al livello N servono N x 10 PX
  px: { costPerLevel: 10 },
} as const;

export const STAT_IDS = RULES.stats.map((s) => s.id) as StatId[];
