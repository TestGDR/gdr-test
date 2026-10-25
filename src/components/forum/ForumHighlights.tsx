"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { when } from "./forum-data";

export type Highlight = {
  post_id: string;
  thread_id: string;
  title: string;
  section_name: string;
  author_name: string;
  highlighted_by: string | null;
  highlighted_at: string;
};

// Post segnalati dallo staff che chi guarda non ha ancora visto.
// Si aggiorna in tempo reale quando qualcuno segnala un post
export function useForumHighlights(userId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Highlight[]>([]);

  const refresh = useCallback(
    () =>
      supabase.rpc("forum_pending_highlights").then(({ data, error }) => {
        if (!error) setItems((data as Highlight[] | null) ?? []);
      }),
    [supabase],
  );

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`forum-segnalati:${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "forum_posts" },
        // segnalato o tolto (le modifiche ai testi sono rare: si ricontrolla comunque)
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, refresh]);

  // letta o chiusa: non torna piu'
  const markSeen = useCallback(
    async (ids: string[]) => {
      setItems((x) => x.filter((h) => !ids.includes(h.post_id)));
      if (ids.length)
        await supabase
          .from("forum_highlight_seen")
          .upsert(ids.map((post_id) => ({ post_id })), { ignoreDuplicates: true });
    },
    [supabase],
  );

  return { items, refresh, markSeen };
}

// Finestra "Post segnalato": titolo, sezione, chi l'ha scritto e chi l'ha segnalato
export function HighlightsModal({
  items,
  onRead,
  onClose,
}: {
  items: Highlight[];
  onRead: (h: Highlight) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={items.length > 0}
      onClose={onClose}
      title={items.length > 1 ? "Post segnalati" : "Post segnalato"}
    >
      <div className="space-y-3 p-4">
        <ul className="space-y-3">
          {items.map((h) => (
            <li key={h.post_id} className="flex items-center gap-3 border border-[#c08a4e]/50 bg-black/30 px-3 py-2.5">
              <span aria-hidden className="text-xl">📌</span>
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-lg leading-tight break-words text-accent">{h.title}</span>
                <span className="block text-xs text-muted">
                  {h.section_name} · scritto da {h.author_name}
                  {h.highlighted_by && ` · segnalato da ${h.highlighted_by}`} · {when(h.highlighted_at)}
                </span>
              </span>
              <button type="button" onClick={() => onRead(h)} className="btn shrink-0 px-3 py-1.5 text-xs tracking-[0.12em] uppercase">
                Leggi
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn-ghost px-3 py-1.5 text-xs tracking-[0.12em] uppercase">
            Chiudi
          </button>
        </div>
      </div>
    </Modal>
  );
}
