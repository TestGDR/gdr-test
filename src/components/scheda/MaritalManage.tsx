"use client";

import { useEffect, useMemo, useState } from "react";
import { MARITAL_STATUSES, maritalLabel } from "@/lib/marital";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";

type Pg = { id: string; name: string; house: { name: string } | null };

// Scheda -> Gestisci: stato civile (solo admin). Sposato e fidanzato
// ufficialmente possono indicare un PG o un PNG
export default function MaritalManage({
  character,
  onSaved,
}: {
  character: Character;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState(character.marital_status ?? "");
  const [kind, setKind] = useState<"pg" | "png">(
    character.partner_npc ? "png" : "pg",
  );
  const [partner, setPartner] = useState(character.partner_character_id ?? "");
  const [npc, setNpc] = useState(character.partner_npc ?? "");
  const [pgs, setPgs] = useState<Pg[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const withPartner = status === "sposato" || status === "fidanzato";

  useEffect(() => {
    supabase
      .from("characters")
      .select("id, name, house:houses(name)")
      .eq("status", "attivo")
      .neq("id", character.id)
      .order("name")
      .returns<Pg[]>()
      .then(({ data }) => setPgs(data ?? []));
  }, [supabase, character.id]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("set_marital_status", {
      p_character: character.id,
      p_status: status || null,
      p_partner: withPartner && kind === "pg" && partner ? partner : null,
      p_partner_npc: withPartner && kind === "png" ? npc : null,
    });
    setBusy(false);
    if (error)
      return setMsg({
        ok: false,
        text:
          error.message.length < 140
            ? error.message
            : "Stato civile non salvato.",
      });
    setMsg({ ok: true, text: "Stato civile salvato." });
    onSaved();
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h4 className="font-serif text-lg text-accent">Stato civile</h4>
      <p className="text-xs text-muted">
        Con un PG il legame vale per entrambi: la scheda dell&apos;altro PG si
        aggiorna da sola.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
            Stato
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input w-60! py-1.5"
          >
            <option value="">—</option>
            {MARITAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {maritalLabel(s, character.sex)}
              </option>
            ))}
          </select>
        </label>

        {withPartner && (
          <>
            <div className="flex gap-1" role="radiogroup" aria-label="Con chi">
              {(["pg", "png"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`border px-3 py-1.5 text-xs tracking-widest uppercase ${
                    kind === k
                      ? "border-accent bg-blood/20 text-accent"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {k.toUpperCase()}
                </button>
              ))}
            </div>
            {kind === "pg" ? (
              <label className="block min-w-56 flex-1">
                <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
                  Personaggio
                </span>
                <select
                  value={partner}
                  onChange={(e) => setPartner(e.target.value)}
                  className="input py-1.5"
                >
                  <option value="">
                    {pgs ? "— Nessuno —" : "Caricamento..."}
                  </option>
                  {(pgs ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.house ? `${p.name} ${p.house.name}` : p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block min-w-56 flex-1">
                <span className="mb-1 block text-xs tracking-wider text-muted uppercase">
                  Nome del PNG
                </span>
                <input
                  value={npc}
                  onChange={(e) => setNpc(e.target.value)}
                  maxLength={60}
                  placeholder="Es. Lady Catelyn Tully"
                  className="input py-1.5"
                />
              </label>
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="btn px-5 py-1.5 text-sm"
        >
          {busy ? "Salvataggio..." : "Salva stato civile"}
        </button>
        {msg && (
          <span
            className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}
          >
            {msg.text}
          </span>
        )}
      </div>
    </section>
  );
}
