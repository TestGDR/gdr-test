import { nextStage, stageLabel, type Dragon, type DragonStage } from "@/lib/dragons";

// Barre del drago: maturazione (PX investiti verso la fase successiva) e
// fedelta' al cavaliere. "parchment" per il pannello di pergamena, "dark"
// per le schede su fondo scuro.
export default function DragonBars({
  dragon,
  stages,
  variant = "dark",
}: {
  dragon: Pick<Dragon, "stage" | "growth_px" | "loyalty">;
  stages: DragonStage[];
  variant?: "dark" | "parchment";
}) {
  const cost = stages.find((s) => s.stage === dragon.stage)?.px_to_next ?? null;
  const next = nextStage(dragon.stage, stages);
  const adult = cost === null || !next;
  return (
    <div className="space-y-2.5">
      <Bar
        label={`Maturazione — ${stageLabel(dragon.stage, stages)}`}
        right={adult ? "adulto" : `${dragon.growth_px} / ${cost} PX`}
        value={adult ? 1 : Math.min(1, dragon.growth_px / Math.max(1, cost))}
        fill="bg-[linear-gradient(90deg,#8a6420,#d4a72c_60%,#f0cf6a)]"
        variant={variant}
        hint={adult ? "Ha raggiunto l'ultima fase di crescita." : `Mancano ${Math.max(0, cost - dragon.growth_px)} PX per diventare ${next.label.toLowerCase()}.`}
      />
      <Bar
        label="Fedeltà"
        right={`${dragon.loyalty} / 100`}
        value={dragon.loyalty / 100}
        fill="bg-[linear-gradient(90deg,#5e1611,#a3201b_60%,#d9682a)]"
        variant={variant}
        hint="Più il drago è fedele al suo cavaliere, più potrà avere bonus sui tiri."
      />
    </div>
  );
}

function Bar({
  label,
  right,
  value,
  fill,
  variant,
  hint,
}: {
  label: string;
  right: string;
  value: number;
  fill: string;
  variant: "dark" | "parchment";
  hint: string;
}) {
  const text = variant === "parchment" ? "text-[#3b2a1a]" : "text-foreground";
  const track = variant === "parchment" ? "border-[#6b4a2e] bg-[#2a1d12]" : "border-[#8a6a3e]/70 bg-black/70";
  return (
    <div title={hint}>
      <div className={`mb-1 flex items-baseline justify-between gap-2 font-serif text-xs sm:text-sm ${text}`}>
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 whitespace-nowrap tabular-nums">{right}</span>
      </div>
      <div className={`h-3 overflow-hidden border ${track} shadow-[inset_0_1px_3px_rgb(0_0_0/0.8)]`}>
        <div className={`h-full ${fill} shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition-[width] duration-500`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
