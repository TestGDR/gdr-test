"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  PERIODS,
  SEASONS,
  condition,
  conditionIcon,
  romeHour,
  type WeatherDay,
  type WeatherRegion,
} from "@/lib/weather";

// Meteo di oggi. Con una regione (quella della mappa in cui ci si trova) mostra
// quella; altrimenti si sceglie tra le regioni attive.
export default function WeatherView({ regionId }: { regionId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [regions, setRegions] = useState<WeatherRegion[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(regionId);
  const [day, setDay] = useState<WeatherDay | null | undefined>(undefined);
  const [hour] = useState(romeHour);

  useEffect(() => {
    supabase
      .from("weather_regions")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        const list = (data ?? []) as WeatherRegion[];
        setRegions(list);
        setChosen((c) => c ?? list[0]?.id ?? null);
      });
  }, [supabase]);

  useEffect(() => {
    if (!chosen) return;
    supabase.rpc("weather_today", { p_region: chosen }).then(({ data }) => setDay((data as WeatherDay | null) ?? null));
  }, [supabase, chosen]);

  if (regions === null) return <p className="py-6 text-center text-muted">Caricamento...</p>;
  if (regions.length === 0 && !regionId) return <p className="py-6 text-center text-muted">Nessuna regione climatica attiva.</p>;

  const region = regions.find((r) => r.id === chosen);
  const now = day?.hours?.[hour];

  return (
    <div className="space-y-5">
      {/* senza una regione legata al luogo: scelta tra le regioni attive */}
      {!regionId && regions.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {regions.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setDay(undefined);
                setChosen(r.id);
              }}
              className={`border px-3 py-1 text-xs tracking-wider uppercase ${r.id === chosen ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      <div className="text-center">
        <h3 className="font-serif text-2xl text-accent">{region?.name ?? "Meteo"}</h3>
        {day && <p className="text-xs tracking-[0.2em] text-muted uppercase">{SEASONS.find((s) => s.id === day.season)?.label}</p>}
      </div>

      {day === undefined && <p className="text-center text-muted">Caricamento...</p>}
      {day === null && <p className="text-center text-muted">Nessun meteo disponibile per questa regione e stagione.</p>}

      {day && now && (
        <>
          {/* adesso */}
          <div className="flex items-center justify-center gap-5 border border-border bg-black/40 py-4">
            <span className="text-6xl" aria-hidden>
              {conditionIcon(now.cond, hour)}
            </span>
            <div>
              <p className="font-serif text-4xl">{now.temp}°</p>
              <p className="text-sm text-foreground">{condition(now.cond).label}</p>
              <p className="text-xs text-muted">Adesso · ore {String(hour).padStart(2, "0")}:00</p>
            </div>
          </div>

          {/* fasce della giornata */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PERIODS.map((p) => {
              const hs = day.hours.slice(p.from, p.to + 1);
              const temps = hs.map((x) => x.temp);
              const mid = day.hours[Math.floor((p.from + p.to) / 2)];
              const current = hour >= p.from && hour <= p.to;
              return (
                <div key={p.id} className={`border p-3 text-center ${current ? "border-accent bg-blood/15" : "border-border bg-black/30"}`}>
                  <p className="text-xs tracking-[0.15em] text-muted uppercase">{p.label}</p>
                  <p className="my-1 text-3xl" aria-hidden>
                    {conditionIcon(mid.cond, Math.floor((p.from + p.to) / 2))}
                  </p>
                  <p className="text-sm">{condition(mid.cond).label}</p>
                  <p className="text-xs text-muted">
                    {Math.min(...temps)}° / {Math.max(...temps)}°
                  </p>
                </div>
              );
            })}
          </div>

          {/* ora per ora */}
          <div className="overflow-x-auto pb-1">
            <ol className="flex min-w-max gap-1">
              {day.hours.map((x, h) => (
                <li
                  key={h}
                  title={`${String(h).padStart(2, "0")}:00 · ${condition(x.cond).label}, ${x.temp}°`}
                  className={`flex w-11 flex-col items-center border py-1.5 text-xs ${h === hour ? "border-accent bg-blood/20 text-foreground" : "border-border/60 text-muted"}`}
                >
                  <span>{String(h).padStart(2, "0")}</span>
                  <span className="text-lg" aria-hidden>
                    {conditionIcon(x.cond, h)}
                  </span>
                  <span className="text-foreground">{x.temp}°</span>
                </li>
              ))}
            </ol>
          </div>

          {region?.climate && <p className="text-xs leading-relaxed text-muted italic">{region.climate}</p>}
        </>
      )}
    </div>
  );
}
