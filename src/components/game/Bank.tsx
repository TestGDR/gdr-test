"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Account = {
  id: string;
  name: string;
  coins: number;
  status: "bozza" | "attivo";
  last_salary_on: string | null;
  house_role: { name: string; daily_salary: number } | null;
};
type Movement = { id: number; amount: number; kind: string; description: string; balance_after: number; created_at: string };

const romeToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Utility -> Banca: saldo, stipendio giornaliero e movimenti del conto
export default function Bank() {
  const supabase = useMemo(() => createClient(), []);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [movements, setMovements] = useState<Movement[]>([]);

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const { data: pg } = await supabase
        .from("characters")
        .select("id, name, coins, status, last_salary_on, house_role:house_roles(name, daily_salary)")
        .eq("owner_id", session.session?.user.id ?? "")
        .order("created_at")
        .limit(1)
        .maybeSingle<Account>();
      const { data: list } = pg
        ? await supabase.from("bank_transactions").select("*").eq("character_id", pg.id).order("created_at", { ascending: false }).limit(50)
        : { data: [] };
      return { pg, list: (list ?? []) as Movement[] };
    })().then(({ pg, list }) => {
      setAccount(pg);
      setMovements(list);
    });
  }, [supabase]);

  if (account === undefined) return <p className="text-center text-muted">Caricamento...</p>;
  if (account === null) return <p className="text-center text-muted">Non hai ancora un personaggio.</p>;

  const salary = account.house_role?.daily_salary ?? 0;
  const paidToday = account.last_salary_on === romeToday();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-black/40 p-4 text-center">
          <p className="text-xs tracking-[0.2em] text-muted uppercase">Conto di {account.name}</p>
          <p className="mt-1 font-serif text-4xl text-accent">{account.coins}</p>
          <p className="text-sm text-muted">monete</p>
        </div>
        <div className="rounded-md border border-border bg-black/40 p-4 text-center">
          <p className="text-xs tracking-[0.2em] text-muted uppercase">Stipendio giornaliero</p>
          {account.status !== "attivo" ? (
            <p className="mt-3 text-sm text-muted">Arriverà quando il personaggio sarà creato e avrà un ruolo in una casata.</p>
          ) : salary > 0 ? (
            <>
              <p className="mt-1 font-serif text-4xl text-foreground">{salary}</p>
              <p className="text-sm text-muted">monete · {account.house_role?.name}</p>
              <p className={`mt-1 text-xs ${paidToday ? "text-green-300" : "text-orange-300"}`}>
                {paidToday ? "Ritirato oggi" : "Si ritira da solo al prossimo accesso"}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">Nessuno: il tuo ruolo nella casata non prevede uno stipendio.</p>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-muted">
        Lo stipendio si ritira automaticamente al primo accesso di ogni giorno (ora italiana).
      </p>

      <section>
        <h3 className="mb-2 border-b border-blood/50 pb-1 font-serif text-xl text-accent">Movimenti</h3>
        {movements.length === 0 ? (
          <p className="text-sm text-muted">Nessun movimento.</p>
        ) : (
          <ul className="divide-y divide-border/60 text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
                <span className="w-24 shrink-0 text-xs text-muted">{when(m.created_at)}</span>
                <span className="min-w-40 flex-1">{m.description}</span>
                <span className={`font-semibold ${m.amount >= 0 ? "text-green-300" : "text-red-400"}`}>
                  {m.amount >= 0 ? "+" : ""}
                  {m.amount}
                </span>
                <span className="w-20 text-right text-xs text-muted">saldo {m.balance_after}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
