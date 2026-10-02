"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { untilLabel } from "@/lib/world";

export type Guest = { id: string; name: string };

const noop = () => () => {};

// Chat privata: chi ne e' padrone (membri della casata, inquilino) invita e caccia
export default function RoomAccessBar({
  roomId,
  info,
  endsAt,
  canManage,
  guests,
}: {
  roomId: string;
  info: string;
  endsAt: string | null;
  canManage: boolean;
  guests: Guest[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(call: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error } = await call;
    setBusy(false);
    if (error) return setError(error.message);
    setName("");
    router.refresh();
  }

  return (
    <div className="mb-3 rounded-md border border-border bg-black/40 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-foreground">
          {info}
          {endsAt && inBrowser && <span className="text-muted"> · {untilLabel(endsAt)}</span>}
        </span>

        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Invitati:</span>
          {guests.length === 0 && <span className="text-xs text-muted italic">nessuno</span>}
          {guests.map((g) => (
            <span key={g.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
              {g.name}
              {canManage && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(supabase.rpc("expel_from_room", { p_room: roomId, p_character: g.id }))}
                  aria-label={`Caccia ${g.name}`}
                  title={`Caccia ${g.name}`}
                  className="text-muted hover:text-red-400"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </span>

        {canManage && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) run(supabase.rpc("invite_to_room", { p_room: roomId, p_name: name }));
            }}
            className="ml-auto flex items-center gap-2"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome del personaggio"
              aria-label="Personaggio da invitare"
              className="input w-44 py-1 text-xs"
            />
            <button className="btn px-3 py-1 text-xs" disabled={busy || !name.trim()}>
              Invita
            </button>
          </form>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
