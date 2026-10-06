"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";

export type ForumCategory = { id: string; name: string; sort_order: number };
export type ForumSection = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  visibility: "tutti" | "staff" | "casata";
  house_id: string | null;
  sort_order: number;
};
export type ForumThread = {
  id: string;
  section_id: string;
  title: string;
  author_id: string | null;
  author_name: string;
  pinned: boolean;
  important: boolean;
  locked: boolean;
  created_at: string;
  last_post_at: string;
  section?: { name: string } | null;
  posts?: { count: number }[];
};
export type ForumPost = {
  id: string;
  thread_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  edited_by_name: string | null;
  author?: { avatar_url: string | null } | null;
};
export type Unread = { thread_id: string; section_id: string; since: string };

export const THREAD_SELECT =
  "*, section:forum_sections(name), posts:forum_posts(count)";

export const when = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// Quante discussioni hanno interventi nuovi: l'icona del forum si accende.
// Si aggiorna in tempo reale quando qualcuno scrive
export function useForumUnread(userId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState(0);

  const refresh = useCallback(
    () =>
      supabase.rpc("forum_unread").then(({ data, error }) => {
        if (!error) setCount(((data as Unread[] | null) ?? []).length);
      }),
    [supabase],
  );

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`forum:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "forum_posts" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, userId, refresh]);

  return { count, refresh };
}

export const ForumUnreadContext = createContext(0);
