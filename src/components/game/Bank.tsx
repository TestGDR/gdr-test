"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type Account = {
  id: string;
  name: string;
  coins: number; // conto in banca
  pocket: number; // in tasca
  status: "bozza" | "attivo";
  last_salary_on: string | null;
  house_role: { name: string; daily_salary: number } | null;
};
type Movement = { id: number; amount: number; kind: string; description: string; balance_after: number; created_at: string };
type Recipient = { id: string; label: string };

const romeToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Utility -> Banca: conto e tasca del PG, stipendio, prelievi, depositi, bonifici
export default function Bank() {
  const supabase = useMemo(() => createClient(), []);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [pgs, setPgs] = useState<Recipient[]>([]);
  const [npcs, setNpcs] = useState<Recipient[]>([]);

  const fetchAll = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const { data: pg } = await supabase
      .from("characters")
      .select("id, name, coins, pocket, status, last_salary_on, house_role:house_roles(name, daily_salary)")
      .eq("owner_id", session.session?.user.id ?? "")
      .order("created_at")
      .limit(1)
      .maybeSingle<Account>();
    const [list, others, png] = await Promise.all([
      pg
        ? supabase.from("bank_transactions").select("*").eq("character_id", pg.id).order("created_at", { ascending: false }).limit(50)
        : Promise.resolve({ data: [] }),
      supabase.from("characters").select("id, name, house:houses(name)").eq("status", "attivo").neq("id", pg?.id ?? "").order("name"),
      supabase.from("house_npcs").select("id, name, house:houses(name)").eq("deceased", false).order("name"),
    ]);
    type Named = { id: string; name: string; house: { name: string } | null };
    const label = (n: Named) => (n.house ? `${n.name} ${n.house.name}` : n.name);
    return {
      pg,
      list: (list.data ?? []) as Movement[],
      pgs: ((others.data ?? []) as unknown as Named[]).map((n) => ({ id: n.id, label: label(n) })),
      npcs: ((png.data ?? []) as unknown as Named[]).map((n) => ({ id: n.id, label: label(n) })),
    };
  }, [supabase]);

  const apply = useCallback((d: Awaited<ReturnType<typeof fetchAll>>) => {
    setAccount(d.pg);
    setMovements(d.list);
    setPgs(d.pgs);
    setNpcs(d.npcs);
  }, []);

  useEffect(() => {
    fetchAll().then(apply);
  }, [fetchAll, apply]);

  const reload = () => fetchAll().then(apply);

  if (account === undefined) return <p className="text-center text-muted">Caricamento...</p>;
  if (account === null) return <p className="text-center text-muted">Non hai ancora un personaggio.</p>;

  const salary = account.house_role?.daily_salary ?? 0;
  const paidToday = account.last_salary_on === romeToday();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <p className="text-center font-serif text-lg text-accent">Conto di {account.name}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="In banca" value={account.coins} note="monete sul conto" big />
        <Tile label="In tasca" value={account.pocket} note="monete con te" big />
        <div className="rounded-md border border-border bg-black/40 p-4 text-center">
          <p className="text-xs tracking-[0.2em] text-muted uppercase">Stipendio</p>
          {account.status !== "attivo" ? (
            <p className="mt-2 text-xs text-muted">Arriverà quando il PG sarà creato e avrà un ruolo in una casata.</p>
          ) : salary > 0 ? (
            <>
              <p className="mt-1 font-serif text-3xl text-foreground">{salary}</p>
              <p className="text-xs text-muted">al giorno · {account.house_role?.name}</p>
              <p className={`mt-1 text-xs ${paidToday ? "text-green-300" : "text-orange-300"}`}>
                {paidToday ? "Ritirato oggi" : "Si ritira al prossimo accesso"}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted">Il tuo ruolo nella casata non prevede uno stipendio.</p>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-muted">
        Lo stipendio arriva sul conto da solo al primo accesso di ogni giorno (ora italiana).
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Box title="Preleva o deposita">
          <CashForm account={account} onDone={reload} />
        </Box>
        <Box title="Bonifico">
          <TransferForm account={account} pgs={pgs} npcs={npcs} onDone={reload} />
        </Box>
      </div>

      <section>
        <h3 className="mb-2 border-b border-blood/50 pb-1 font-serif text-xl text-accent">Movimenti del conto</h3>
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

function Tile({ label, value, note, big }: { label: string; value: number; note: string; big?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-black/40 p-4 text-center">
      <p className="text-xs tracking-[0.2em] text-muted uppercase">{label}</p>
      <p className={`mt-1 font-serif text-accent ${big ? "text-4xl" : "text-2xl"}`}>{value}</p>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-black/40 p-4">
      <h3 className="mb-3 font-serif text-lg text-accent">{title}</h3>
      {children}
    </section>
  );
}

// Esito dell'ultima operazione
function useOperation(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(call: PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    setResult(null);
    const { error } = await call;
    setBusy(false);
    setResult(error ? { ok: false, text: error.message } : { ok: true, text: ok });
    if (!error) onDone();
    return !error;
  }
  const feedback = result && <p className={`text-xs ${result.ok ? "text-green-300" : "text-red-400"}`}>{result.text}</p>;
  return { run, busy, feedback };
}

function CashForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const { run, busy, feedback } = useOperation(onDone);
  const [amount, setAmount] = useState("");
  const n = Math.floor(Number(amount));
  const valid = Number.isFinite(n) && n >= 1;

  async function move(kind: "preleva" | "deposita") {
    const ok =
      kind === "preleva"
        ? await run(supabase.rpc("bank_withdraw", { p_character: account.id, p_amount: n }), `Hai prelevato ${n} monete: ora sono in tasca.`)
        : await run(supabase.rpc("bank_deposit", { p_character: account.id, p_amount: n }), `Hai depositato ${n} monete sul conto.`);
    if (ok) setAmount("");
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Monete</span>
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => move("preleva")} disabled={busy || !valid || n > account.coins} className="btn flex-1 px-3 py-1.5 text-sm">
          Preleva ↓ in tasca
        </button>
        <button type="button" onClick={() => move("deposita")} disabled={busy || !valid || n > account.pocket} className="btn-ghost flex-1 px-3 py-1.5 text-sm">
          Deposita ↑ sul conto
        </button>
      </div>
      {feedback}
    </div>
  );
}

function TransferForm({
  account,
  pgs,
  npcs,
  onDone,
}: {
  account: Account;
  pgs: Recipient[];
  npcs: Recipient[];
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { run, busy, feedback } = useOperation(onDone);
  const [to, setTo] = useState<"pg" | "png">("pg");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const list = to === "pg" ? pgs : npcs;
  const target = list.find((r) => r.label.toLowerCase() === name.trim().toLowerCase());
  const n = Math.floor(Number(amount));
  const valid = !!target && Number.isFinite(n) && n >= 1 && n <= account.coins;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!target || !valid) return;
    const ok = await run(
      supabase.rpc("bank_transfer", {
        p_from: account.id,
        p_to_character: to === "pg" ? target.id : null,
        p_to_npc: to === "png" ? target.id : null,
        p_amount: n,
        p_reason: reason,
      }),
      `Bonifico di ${n} monete a ${target.label} eseguito.`,
    );
    if (ok) {
      setName("");
      setAmount("");
      setReason("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex gap-4 text-sm">
        {(["pg", "png"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1.5">
            <input
              type="radio"
              name="destinatario"
              checked={to === k}
              onChange={() => {
                setTo(k);
                setName("");
              }}
              className="accent-[var(--accent)]"
            />
            {k === "pg" ? "A un PG" : "A un PNG"}
          </label>
        ))}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Destinatario</span>
        <input
          list={`destinatari-${to}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={to === "pg" ? "Nome del personaggio" : "Nome del PNG"}
          className="input"
        />
        <datalist id={`destinatari-${to}`}>
          {list.map((r) => (
            <option key={r.id} value={r.label} />
          ))}
        </datalist>
        {name.trim() && !target && <span className="mt-1 block text-xs text-orange-300">Scegli un nome dall&apos;elenco.</span>}
      </label>
      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Monete</span>
          <input type="number" min={1} max={account.coins} value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs tracking-wider text-muted uppercase">Causale</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Facoltativa" className="input" />
        </label>
      </div>
      <button className="btn w-full py-1.5 text-sm" disabled={busy || !valid}>
        Manda dal conto
      </button>
      {to === "png" && <p className="text-xs text-muted">I PNG non hanno un conto: le monete escono dal gioco.</p>}
      {feedback}
    </form>
  );
}
