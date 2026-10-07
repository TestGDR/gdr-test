"use client";

import { useEffect, useMemo, useState } from "react";
import type { CreationData } from "@/lib/character-creation";
import { createClient } from "@/lib/supabase/client";

type SignupRole = {
  house_id: string;
  house_name: string;
  sigil_url: string | null;
  role_id: string;
  role_name: string;
  daily_salary: number;
  free_slots: number;
};

type FreeDragon = {
  id: string;
  status: "uovo" | "drago";
  name: string;
  stage: string | null;
  sex: string | null;
  color1: string | null;
  color2: string | null;
  image_url: string | null;
};

type Props = {
  data: CreationData;
  update: (patch: Partial<CreationData>) => void;
};

// Casata del ruolo scelto (serve al blocco Drago e al riepilogo)
function useRoleHouse(roleId: string | undefined) {
  const supabase = useMemo(() => createClient(), []);
  const [info, setInfo] = useState<{
    roleId: string;
    house_id: string;
    house: string;
    role: string;
  } | null>(null);
  useEffect(() => {
    if (!roleId) return;
    supabase
      .from("house_roles")
      .select("name, house_id, house:houses(name)")
      .eq("id", roleId)
      .maybeSingle<{
        name: string;
        house_id: string;
        house: { name: string } | null;
      }>()
      .then(({ data }) =>
        setInfo(
          data
            ? {
                roleId,
                house_id: data.house_id,
                house: data.house?.name ?? "",
                role: data.name,
              }
            : null,
        ),
      );
  }, [supabase, roleId]);
  return roleId && info?.roleId === roleId ? info : null;
}

// ---------------------------------------------------------------------
// Casata e ruolo: quelli aperti all'iscrizione per il sesso e l'eta' scelti
// ---------------------------------------------------------------------
export function StepHouse({ data, update }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [roles, setRoles] = useState<{
    key: string;
    list: SignupRole[];
  } | null>(null);
  const key = `${data.sex ?? ""}-${data.age ?? ""}`;

  useEffect(() => {
    if (!data.sex || !data.age) return;
    supabase
      .rpc("signup_house_roles", { p_sex: data.sex, p_age: data.age })
      .then(({ data: rows }) =>
        setRoles({
          key: `${data.sex}-${data.age}`,
          list: (rows ?? []) as SignupRole[],
        }),
      );
  }, [supabase, data.sex, data.age]);

  if (!data.sex || !data.age)
    return (
      <p className="text-sm text-muted">
        Indica prima sesso ed età: i ruoli disponibili dipendono da questi.
      </p>
    );
  const list = roles?.key === key ? roles.list : null;
  if (!list) return <p className="text-sm text-muted">Caricamento...</p>;
  if (!list.length)
    return (
      <p className="text-sm text-muted">
        Per il sesso e l&apos;età scelti non ci sono ruoli aperti
        all&apos;iscrizione: prova a cambiarli o chiedi allo staff.
      </p>
    );

  const houses = [...new Map(list.map((r) => [r.house_id, r])).values()];
  const chosenGone =
    data.house_role_id && !list.some((r) => r.role_id === data.house_role_id);

  return (
    <div className="space-y-4">
      {chosenGone && (
        <p className="text-sm text-red-400">
          Il ruolo scelto prima non è più disponibile per il sesso e l&apos;età
          indicati: scegline un altro.
        </p>
      )}
      {houses.map((h) => (
        <section
          key={h.house_id}
          className="border border-border bg-black/30 p-3"
        >
          <h4 className="mb-2 flex items-center gap-2 font-serif text-lg text-accent">
            {h.sigil_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={h.sigil_url}
                alt=""
                className="h-7 w-7 object-contain"
              />
            )}
            Casata {h.house_name}
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {list
              .filter((r) => r.house_id === h.house_id)
              .map((r) => {
                const on = data.house_role_id === r.role_id;
                return (
                  <button
                    key={r.role_id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      update({
                        house_role_id: r.role_id,
                        // cambiando casata il drago scelto non vale piu'
                        dragon_id: on ? data.dragon_id : undefined,
                      })
                    }
                    className={`border px-3 py-2 text-left text-sm transition ${
                      on
                        ? "border-accent bg-accent/15"
                        : "border-border hover:border-accent/60"
                    }`}
                  >
                    <span className="block font-semibold">{r.role_name}</span>
                    <span className="block text-xs text-muted">
                      {r.daily_salary
                        ? `Stipendio ${r.daily_salary} al giorno · `
                        : ""}
                      {r.free_slots}{" "}
                      {r.free_slots === 1 ? "posto libero" : "posti liberi"}
                    </span>
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Drago: uno solo tra i draghi e le uova liberi della casata scelta
// ---------------------------------------------------------------------
export function StepDragon({ data, update }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const house = useRoleHouse(data.house_role_id);
  const [dragons, setDragons] = useState<{
    house: string;
    list: FreeDragon[];
  } | null>(null);

  useEffect(() => {
    if (!house) return;
    supabase
      .from("dragons")
      .select("id, status, name, stage, sex, color1, color2, image_url")
      .eq("house_id", house.house_id)
      .is("rider_id", null)
      .is("npc_rider_id", null)
      .order("status")
      .order("name")
      .then(({ data: rows }) =>
        setDragons({
          house: house.house_id,
          list: (rows ?? []) as FreeDragon[],
        }),
      );
  }, [supabase, house]);

  if (!data.house_role_id)
    return <p className="text-sm text-muted">Scegli prima la casata.</p>;
  const list = house && dragons?.house === house.house_id ? dragons.list : null;
  if (!list) return <p className="text-sm text-muted">Caricamento...</p>;
  if (!list.length)
    return (
      <p className="text-sm text-muted">
        La Casata {house?.house} non ha draghi o uova liberi: puoi andare
        avanti.
      </p>
    );

  const option = (
    id: string | undefined,
    title: string,
    sub: string,
    img?: string | null,
  ) => {
    const on = data.dragon_id === id;
    return (
      <button
        key={id ?? "nessuno"}
        type="button"
        aria-pressed={on}
        onClick={() => update({ dragon_id: id })}
        className={`flex items-center gap-3 border px-3 py-2 text-left text-sm transition ${
          on
            ? "border-accent bg-accent/15"
            : "border-border hover:border-accent/60"
        }`}
      >
        {img !== undefined && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-border bg-black/40 text-xl">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="" className="h-full w-full object-cover" />
            ) : (
              "🥚"
            )}
          </span>
        )}
        <span>
          <span className="block font-semibold">{title}</span>
          <span className="block text-xs text-muted">{sub}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        La Casata {house?.house} ha {list.length}{" "}
        {list.length === 1 ? "drago o uovo libero" : "draghi o uova liberi"}:
        puoi reclamarne <strong className="text-accent">uno solo</strong>,
        oppure nessuno.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {option(undefined, "Nessun drago", "Non reclamo niente")}
        {list.map((d) =>
          option(
            d.id,
            d.status === "uovo"
              ? d.name || "Uovo di drago"
              : d.name || "Drago senza nome",
            [
              d.status === "uovo" ? "Uovo" : d.stage,
              d.sex,
              [d.color1, d.color2].filter(Boolean).join(" e "),
            ]
              .filter(Boolean)
              .join(" · "),
            d.status === "uovo" ? null : (d.image_url ?? null),
          ),
        )}
      </div>
    </div>
  );
}

// Riepilogo
export function HouseSummary({ data }: { data: CreationData }) {
  const house = useRoleHouse(data.house_role_id);
  return (
    <div>
      <dt className="text-xs text-muted uppercase">Casata e ruolo</dt>
      <dd>
        {!data.house_role_id
          ? "—"
          : house
            ? `${house.role} · Casata ${house.house}`
            : "..."}
      </dd>
    </div>
  );
}

export function DragonSummary({ data }: { data: CreationData }) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    if (!data.dragon_id) return;
    const id = data.dragon_id;
    supabase
      .from("dragons")
      .select("name, status")
      .eq("id", id)
      .maybeSingle()
      .then(({ data: d }) =>
        setName({
          id,
          text: d
            ? d.status === "uovo"
              ? d.name || "Uovo di drago"
              : d.name || "Drago"
            : "?",
        }),
      );
  }, [supabase, data.dragon_id]);
  return (
    <div>
      <dt className="text-xs text-muted uppercase">Drago</dt>
      <dd>
        {!data.dragon_id
          ? "Nessuno"
          : name?.id === data.dragon_id
            ? name.text
            : "..."}
      </dd>
    </div>
  );
}
