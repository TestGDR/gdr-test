"use client";

import { useRouter } from "next/navigation";
import { STORY_MAX } from "@/lib/character-creation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SheetModal } from "@/components/scheda/SheetButton";
import { loadCatalog, type Skill, type Trait } from "@/lib/rules/catalog";
import { durability } from "@/lib/rules/combat";
import { durabilityBonus, qualityBonus } from "@/lib/rules/quality";
import { useQualityBonuses } from "@/lib/rules/useQualityBonuses";
import { RULES } from "@/lib/rules/config";
import { deriveStats, skillLevelCap, type Stats } from "@/lib/rules/engine";
import { currentHp, hpState, HP_STATE_LABEL } from "@/lib/rules/hp";
import { useStats } from "@/lib/rules/useStats";
import { createClient } from "@/lib/supabase/client";
import type { Character } from "@/lib/types";
import {
  addNpcItem,
  deleteNpc,
  healNpc,
  loadNpcExtra,
  removeNpcItem,
  saveNpc,
} from "./actions";

export type HouseNpc = {
  id: string;
  name: string;
  house_id: string;
  image_url: string | null;
  deceased: boolean;
};
export type StaffUser = { id: string; name: string; role: string };
type Npc = Character & {
  house_npc_id?: string | null;
  npc_manager_id?: string | null;
  npc_public?: boolean;
};
type Msg = { ok: boolean; text: string } | null;
const lbl = "mb-1 block text-xs tracking-wider text-muted uppercase";

const statsOf = (c: Character | null, ids: string[]) =>
  Object.fromEntries(
    ids.map((id) => [id, Number(c?.attributes?.[id]) || 5]),
  ) as Record<string, number>;

// Gestione -> PNG: anagrafe (elenco con ricerca) e scheda di ogni PNG.
// Nell'elenco ci sono anche i PNG delle casate che non hanno ancora una scheda
export default function NpcManager({
  npcs,
  houses,
  houseNpcs,
  staff,
}: {
  npcs: Npc[];
  houses: { id: string; name: string }[];
  houseNpcs: HouseNpc[];
  staff: StaffUser[];
}) {
  // "nuovo", id di un PNG con scheda, oppure "casata:<id>" per un PNG di casata da compilare
  const [selected, setSelected] = useState<string>(npcs[0]?.id ?? "nuovo");
  const [q, setQ] = useState("");
  const houseName = (id: string | null | undefined) =>
    houses.find((h) => h.id === id)?.name ?? null;
  const houseOf = (n: Npc) =>
    houseNpcs.find((h) => h.id === n.house_npc_id)?.house_id ?? null;
  // PNG di casata senza scheda
  const pending = houseNpcs.filter(
    (h) => !npcs.some((n) => n.house_npc_id === h.id),
  );
  const match = (name: string) =>
    !q || name.toLowerCase().includes(q.toLowerCase());
  const current = npcs.find((n) => n.id === selected) ?? null;
  const fromHouse = selected.startsWith("casata:")
    ? (houseNpcs.find((h) => h.id === selected.slice(7)) ?? null)
    : null;

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setSelected("nuovo")}
          className="btn w-full py-1.5 text-sm"
        >
          + Nuovo PNG
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per nome..."
          aria-label="Cerca un PNG"
          className="input py-1.5 text-sm"
        />
        <p className="text-xs text-muted">
          {npcs.length} con scheda
          {pending.length > 0 && ` · ${pending.length} di casata da compilare`}
        </p>
        <ul className="max-h-[36rem] space-y-1 overflow-y-auto">
          {npcs
            .filter((n) => match(n.name))
            .map((n) => (
              <ListRow
                key={n.id}
                active={selected === n.id}
                onClick={() => setSelected(n.id)}
                name={n.name}
                image={n.avatar_url}
                detail={[
                  houseName(houseOf(n)),
                  n.age ? `${n.age} anni` : null,
                  n.dead_at ? "morto" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          {pending
            .filter((h) => match(h.name))
            .map((h) => (
              <ListRow
                key={h.id}
                active={selected === `casata:${h.id}`}
                onClick={() => setSelected(`casata:${h.id}`)}
                name={h.name}
                image={h.image_url}
                detail={`${houseName(h.house_id) ?? "Casata"} · da compilare`}
                dim
              />
            ))}
          {npcs.length + pending.length === 0 && (
            <li className="text-sm text-muted">Nessun PNG.</li>
          )}
        </ul>
      </div>
      <NpcForm
        key={selected}
        npc={current}
        fromHouse={fromHouse}
        houseId={current ? houseOf(current) : (fromHouse?.house_id ?? null)}
        houses={houses}
        staff={staff}
        onSaved={(id) => setSelected(id)}
      />
    </div>
  );
}

function ListRow({
  active,
  onClick,
  name,
  image,
  detail,
  dim,
}: {
  active: boolean;
  onClick: () => void;
  name: string;
  image: string | null | undefined;
  detail: string;
  dim?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-2 border px-2 py-1.5 text-left text-sm ${
          active
            ? "border-accent bg-blood/20"
            : "border-border/60 bg-black/30 hover:border-accent/60"
        } ${dim ? "border-dashed" : ""}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-border bg-black/50 font-serif text-accent">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            name[0]
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate ${dim ? "text-foreground" : "text-accent"}`}
          >
            {name}
          </span>
          <span className="block truncate text-xs text-muted">{detail}</span>
        </span>
      </button>
    </li>
  );
}

function NpcForm({
  npc,
  fromHouse,
  houseId,
  houses,
  staff,
  onSaved,
}: {
  npc: Npc | null;
  fromHouse: HouseNpc | null; // PNG di casata da compilare
  houseId: string | null;
  houses: { id: string; name: string }[];
  staff: StaffUser[];
  onSaved: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const statList = useStats();
  const [name, setName] = useState(npc?.name ?? fromHouse?.name ?? "");
  const [sex, setSex] = useState<"uomo" | "donna">(
    npc?.sex === "donna" ? "donna" : "uomo",
  );
  const [age, setAge] = useState(String(npc?.age ?? 30));
  const [description, setDescription] = useState(npc?.description ?? "");
  const [appearance, setAppearance] = useState(npc?.appearance ?? "");
  const [story, setStory] = useState("");
  const [avatar, setAvatar] = useState(
    npc?.avatar_url ?? fromHouse?.image_url ?? "",
  );
  const [house, setHouse] = useState(houseId ?? "");
  const [manager, setManager] = useState(npc?.npc_manager_id ?? "");
  const [isPublic, setIsPublic] = useState(npc?.npc_public !== false);
  const [attrs, setAttrs] = useState<Record<string, number> | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [traits, setTraits] = useState<Trait[]>([]);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [owned, setOwned] = useState<
    { trait_id: string; choice: string | null }[]
  >([]);
  const [addTrait, setAddTrait] = useState("");
  const [addChoice, setAddChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);

  // statistiche: quelle del PNG, o 5 per un PNG nuovo
  const values =
    attrs ??
    statsOf(
      npc,
      statList.map((s) => s.id),
    );

  useEffect(() => {
    Promise.all([
      loadCatalog(supabase),
      npc
        ? supabase
            .from("character_skills")
            .select("skill_id, level")
            .eq("character_id", npc.id)
        : Promise.resolve({ data: [] }),
      npc ? loadNpcExtra(npc.id) : Promise.resolve({ story: "", traits: [] }),
    ]).then(([catalog, lv, extra]) => {
      setSkills(catalog.skills.filter((s) => s.active));
      setTraits(catalog.traits.filter((t) => t.active));
      setLevels(
        Object.fromEntries(
          ((lv.data ?? []) as { skill_id: string; level: number }[]).map(
            (l) => [l.skill_id, l.level],
          ),
        ),
      );
      setStory(extra.story);
      setOwned(extra.traits);
    });
  }, [supabase, npc]);

  const derived = deriveStats(
    Object.fromEntries(
      RULES.stats.map((s) => [s.id, values[s.id] ?? RULES.statMin]),
    ) as Stats,
    owned.reduce(
      (sum, o) =>
        sum +
        (traits.find((t) => t.id === o.trait_id)?.modifiers ?? [])
          .filter((m) => m.target === "hp")
          .reduce((a, m) => a + m.value, 0),
      0,
    ),
  );
  const picked = traits.find((t) => t.id === addTrait);
  const choiceText = (t: Trait | undefined, choice: string | null) =>
    !t || !choice
      ? ""
      : t.choice === "statistica"
        ? (statList.find((s) => s.id === choice)?.label ?? choice)
        : (skills.find((s) => s.id === choice)?.name ?? choice);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await saveNpc({
      id: npc?.id,
      name,
      sex,
      age: Number(age),
      description,
      appearance,
      story,
      avatar_url: avatar || null,
      attributes: values,
      skills: levels,
      traits: owned,
      house_id: house || null,
      house_npc_id: npc?.house_npc_id ?? fromHouse?.id ?? null,
      manager_id: manager || null,
      is_public: isPublic,
    });
    setBusy(false);
    if (res.error) return setMsg({ ok: false, text: res.error });
    setMsg({ ok: true, text: "Salvato." });
    router.refresh();
    if (!npc && res.id) onSaved(res.id);
  }
  async function remove() {
    if (!npc) return;
    setBusy(true);
    const res = await deleteNpc(npc.id);
    setBusy(false);
    if (res.error) return setMsg({ ok: false, text: res.error });
    router.refresh();
    onSaved("nuovo");
  }
  async function heal() {
    if (!npc) return;
    setBusy(true);
    const res = await healNpc(npc.id);
    setBusy(false);
    setMsg(
      res.error
        ? { ok: false, text: res.error }
        : { ok: true, text: "PNG di nuovo in piena salute." },
    );
    router.refresh();
  }

  return (
    <div className="space-y-4 border border-border/60 bg-black/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl text-accent">
          {npc
            ? npc.name
            : fromHouse
              ? `${fromHouse.name}: nuova scheda`
              : "Nuovo PNG"}
        </h2>
        {npc && (
          <button
            type="button"
            onClick={() => setSheet(npc.id)}
            className="btn-ghost px-3 py-1 text-xs"
          >
            Apri la scheda
          </button>
        )}
      </div>
      {fromHouse && (
        <p className="border border-[#f0c75e]/40 bg-[#f0c75e]/10 px-3 py-2 text-sm text-[#f0c75e]">
          Questo PNG esiste nella casata ma non ha ancora una scheda: compila e
          premi &quot;Crea il PNG&quot;. Resta collegato alla casata e
          all&apos;albero genealogico.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <label className="block min-w-48 flex-1">
          <span className={lbl}>Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="input py-1.5"
          />
        </label>
        <label className="block">
          <span className={lbl}>Sesso</span>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value as "uomo" | "donna")}
            className="input w-28! py-1.5"
          >
            <option value="uomo">Uomo</option>
            <option value="donna">Donna</option>
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Età</span>
          <input
            type="number"
            min={1}
            max={120}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="input w-20! py-1.5"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="block">
          <span className={lbl}>Casata</span>
          <select
            value={house}
            onChange={(e) => setHouse(e.target.value)}
            className="input w-56! py-1.5"
          >
            <option value="">— nessuna —</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Affidato a</span>
          <select
            value={manager}
            onChange={(e) => setManager(e.target.value)}
            className="input w-56! py-1.5"
          >
            <option value="">Tutti quelli con il permesso</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.role ? ` (${s.role})` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">
        Con una casata il PNG compare anche tra i PNG di quella casata (per
        l&apos;albero genealogico, i ruoli e i draghi). Se è affidato a una
        persona, in chat lo muove solo lei (e l&apos;Admin).
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
        Visibile ai giocatori
        <span className="text-xs text-muted">
          (compare in Utility → Anagrafe PNG e i giocatori possono aprirne la
          scheda; senza spunta lo vede solo chi gestisce i PNG)
        </span>
      </label>
      <label className="block">
        <span className={lbl}>Immagine (indirizzo https, facoltativa)</span>
        <input
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="https://..."
          className="input py-1.5"
        />
      </label>

      <div>
        <p className={lbl}>
          Statistiche ({RULES.statMin}-{RULES.statMax})
        </p>
        <div className="flex flex-wrap gap-3">
          {statList.map((s) => (
            <label key={s.id} className="block">
              <span className="mb-1 block text-xs text-accent" title={s.label}>
                {s.code}
              </span>
              <input
                type="number"
                min={RULES.statMin}
                max={RULES.statMax}
                value={values[s.id] ?? RULES.statMin}
                onChange={(e) =>
                  setAttrs({
                    ...values,
                    [s.id]: Math.min(
                      RULES.statMax,
                      Math.max(0, Math.trunc(Number(e.target.value)) || 0),
                    ),
                  })
                }
                className="input w-16! py-1"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Punti ferita {derived.hp} · Stamina {derived.stamina} · Recupero{" "}
          {derived.rec} · mani nude {derived.unarmed}
          {npc && <NpcHealth npc={npc} maxHp={derived.hp} rec={derived.rec} />}
        </p>
      </div>

      <div>
        <p className={lbl}>
          Abilità (livello 0-{RULES.skillMax}, mai oltre la statistica)
        </p>
        <div className="grid gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {statList.map((s) => {
            const list = skills.filter((k) => k.stat === s.id);
            if (!list.length) return null;
            const cap = skillLevelCap(values[s.id] ?? RULES.statMin);
            return (
              <div key={s.id} className="space-y-1">
                <p className="mt-2 text-xs font-semibold text-accent">
                  {s.label}
                </p>
                {list.map((k) => (
                  <label
                    key={k.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{k.name}</span>
                    <input
                      type="number"
                      min={0}
                      max={cap}
                      value={Math.min(levels[k.id] ?? 0, cap)}
                      onChange={(e) =>
                        setLevels((l) => ({
                          ...l,
                          [k.id]: Math.min(
                            cap,
                            Math.max(
                              0,
                              Math.trunc(Number(e.target.value)) || 0,
                            ),
                          ),
                        }))
                      }
                      className="input w-14! py-0.5 text-sm"
                    />
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className={lbl}>Vantaggi e svantaggi</p>
        {owned.length === 0 ? (
          <p className="text-sm text-muted">Nessuno.</p>
        ) : (
          <ul className="space-y-0.5 text-sm">
            {owned.map((o) => {
              const t = traits.find((x) => x.id === o.trait_id);
              return (
                <li key={o.trait_id} className="flex items-center gap-2">
                  <span
                    className={
                      t?.kind === "svantaggio" ? "text-red-300" : "text-accent"
                    }
                  >
                    {t?.name ?? "—"}
                  </span>
                  {o.choice && (
                    <span className="text-xs text-muted">
                      ({choiceText(t, o.choice)})
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">
                    {t?.effect}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setOwned((l) =>
                        l.filter((x) => x.trait_id !== o.trait_id),
                      )
                    }
                    className="text-xs text-muted hover:text-red-400"
                  >
                    togli
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <select
            value={addTrait}
            onChange={(e) => {
              setAddTrait(e.target.value);
              setAddChoice("");
            }}
            aria-label="Aggiungi un vantaggio o uno svantaggio"
            className="input w-64! py-1 text-sm"
          >
            <option value="">Aggiungi...</option>
            {(["vantaggio", "svantaggio"] as const).map((k) => (
              <optgroup
                key={k}
                label={k === "vantaggio" ? "Vantaggi" : "Svantaggi"}
              >
                {traits
                  .filter(
                    (t) =>
                      t.kind === k && !owned.some((o) => o.trait_id === t.id),
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {picked && picked.choice !== "nessuna" && (
            <select
              value={addChoice}
              onChange={(e) => setAddChoice(e.target.value)}
              aria-label={
                picked.choice === "abilita" ? "Abilità" : "Statistica"
              }
              className="input w-52! py-1 text-sm"
            >
              <option value="">
                {picked.choice === "abilita"
                  ? "Quale abilità..."
                  : "Quale statistica..."}
              </option>
              {picked.choice === "abilita"
                ? skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                : statList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
            </select>
          )}
          <button
            type="button"
            disabled={!picked || (picked.choice !== "nessuna" && !addChoice)}
            onClick={() => {
              if (!picked) return;
              setOwned((l) => [
                ...l,
                {
                  trait_id: picked.id,
                  choice: picked.choice === "nessuna" ? null : addChoice,
                },
              ]);
              setAddTrait("");
              setAddChoice("");
            }}
            className="btn-ghost px-3 py-1 text-xs"
          >
            Aggiungi
          </button>
        </div>
      </div>

      <label className="block">
        <span className={lbl}>Aspetto</span>
        <textarea
          value={appearance}
          onChange={(e) => setAppearance(e.target.value)}
          maxLength={20000}
          rows={3}
          className="input resize-y text-sm"
        />
      </label>
      <label className="block">
        <span className={lbl}>Storia</span>
        <textarea
          value={story}
          onChange={(e) => setStory(e.target.value)}
          maxLength={STORY_MAX}
          rows={5}
          className="input resize-y text-sm"
        />
      </label>
      <label className="block">
        <span className={lbl}>Note per lo staff</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          rows={2}
          className="input resize-y text-sm"
        />
      </label>

      {npc && <NpcItems characterId={npc.id} />}

      <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={save}
          className="btn px-4 py-1.5 text-sm"
        >
          {npc ? "Salva" : "Crea il PNG"}
        </button>
        {npc && (
          <button
            type="button"
            disabled={busy}
            onClick={heal}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            Riporta in piena salute
          </button>
        )}
        {npc &&
          (confirmDelete ? (
            <span className="flex items-center gap-2 text-sm">
              Eliminare la scheda di {npc.name}?
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="text-red-400 hover:text-red-300"
              >
                Sì, elimina
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-muted hover:text-foreground"
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-red-400 hover:text-red-300"
            >
              Elimina
            </button>
          ))}
        {msg && (
          <span
            className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}
          >
            {msg.text}
          </span>
        )}
      </div>
      <SheetModal characterId={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

// PF attuali e stato (ferito, morente, morto) del PNG
function NpcHealth({
  npc,
  maxHp,
  rec,
}: {
  npc: Character;
  maxHp: number;
  rec: number;
}) {
  const [now] = useState(() => Date.now());
  const hp = currentHp(npc, maxHp, rec, now);
  const state = hpState(npc, hp, maxHp);
  if (state === "illeso") return null;
  return (
    <span className="text-red-300">
      {" "}
      · adesso {hp}/{maxHp} PF, {HP_STATE_LABEL[state].toLowerCase()}
    </span>
  );
}

type Owned = {
  id: string;
  equipped: boolean;
  aff_current: number | null;
  sp_current: number | null;
  quality_id: string | null;
  quality: { name: string } | null;
  item: {
    name: string;
    kind: string;
    damage_type: string | null;
    material: string | null;
    damage: string | null;
    aff_max: number | null;
    sp_max: number | null;
    slot_id: string | null;
    slot_group: string | null;
  } | null;
};

// Oggetti del PNG: si danno, si indossano e si tolgono da qui
function NpcItems({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Owned[] | null>(null);
  const bonusRows = useQualityBonuses();
  const [catalog, setCatalog] = useState<
    { id: string; name: string; kind: string; damage: string | null }[]
  >([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      supabase
        .from("character_items")
        .select(
          "id, equipped, aff_current, sp_current, quality_id, quality:item_qualities(name), item:items(name, kind, damage_type, material, damage, aff_max, sp_max, slot_id, slot_group)",
        )
        .eq("character_id", characterId)
        .order("acquired_at")
        .then(({ data }) => setItems((data ?? []) as unknown as Owned[])),
    [supabase, characterId],
  );
  useEffect(() => {
    Promise.resolve().then(load);
    supabase
      .from("items")
      .select("id, name, kind, damage")
      .order("name")
      .then(({ data }) =>
        setCatalog(
          (data ?? []) as {
            id: string;
            name: string;
            kind: string;
            damage: string | null;
          }[],
        ),
      );
  }, [load, supabase]);

  const fail = (m: string) =>
    setError(m.length < 140 ? m : "Operazione non riuscita.");

  async function equip(id: string, on: boolean) {
    setError(null);
    const { error } = await supabase.rpc("equip_item", {
      p_character_item: id,
      p_on: on,
    });
    if (error) fail(error.message);
    load();
  }
  async function add() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    const res = await addNpcItem(characterId, pick);
    setBusy(false);
    if (res.error) return fail(res.error);
    setPick("");
    load();
  }
  async function remove(id: string) {
    setError(null);
    const res = await removeNpcItem(characterId, id);
    if (res.error) fail(res.error);
    load();
  }

  const KIND: Record<string, string> = {
    arma: "Armi",
    scudo: "Scudi",
    armatura: "Armature",
    munizione: "Munizioni",
    altro: "Altro",
  };

  return (
    <div>
      <p className={lbl}>Oggetti</p>
      {!items ? (
        <p className="text-sm text-muted">Caricamento...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Nessun oggetto.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((o) => {
            const wear = o.item
              ? durability(
                  o.item,
                  durabilityBonus(qualityBonus(o.item, o.quality_id, bonusRows)),
                  o,
                )
              : null;
            const wearable = !!(o.item?.slot_id || o.item?.slot_group);
            return (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-accent">{o.item?.name}</span>{" "}
                  <span className="text-xs text-muted">
                    {o.item?.damage ?? ""}
                    {o.quality ? ` · ${o.quality.name}` : ""}
                    {wear ? ` · ${wear.label} ${wear.current}/${wear.max}` : ""}
                  </span>
                </span>
                {wearable && (
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={o.equipped}
                      onChange={() => equip(o.id, !o.equipped)}
                    />
                    indossato
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => remove(o.id)}
                  className="text-xs text-muted hover:text-red-400"
                >
                  togli
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="Oggetto da dare al PNG"
          className="input w-72! py-1 text-sm"
        >
          <option value="">Dai un oggetto...</option>
          {Object.entries(KIND).map(([k, label]) => {
            const list = catalog.filter((c) => (c.kind ?? "altro") === k);
            if (!list.length) return null;
            return (
              <optgroup key={k} label={label}>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.damage ? ` (${c.damage})` : ""}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <button
          type="button"
          disabled={busy || !pick}
          onClick={add}
          className="btn-ghost px-3 py-1 text-xs"
        >
          Dai al PNG
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        In combattimento contano solo gli oggetti indossati: armi e scudi in
        mano, armature sulla loro parte del corpo.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
