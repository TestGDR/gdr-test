"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_YEAR_OFFSET,
  formatGameDate,
  type GameDay,
} from "@/lib/game-date";
import { createClient } from "@/lib/supabase/client";

// Data di gioco di oggi (dal database: tiene conto delle correzioni dell'admin)
export default function GameDateLabel() {
  const supabase = useMemo(() => createClient(), []);
  const [today, setToday] = useState<GameDay>(() => {
    const [y, m, d] = new Date()
      .toLocaleDateString("en-CA", { timeZone: "Europe/Rome" })
      .split("-")
      .map(Number);
    return { day: d, month: m, year: y + DEFAULT_YEAR_OFFSET };
  });

  useEffect(() => {
    supabase.rpc("game_today").then(({ data }) => {
      const row = ((data as GameDay[] | null) ?? [])[0];
      if (row) setToday(row);
    });
  }, [supabase]);

  return <span suppressHydrationWarning>{formatGameDate(today)}</span>;
}
