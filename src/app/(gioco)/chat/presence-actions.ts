"use server";

import { getStaffContext } from "@/lib/staff";

// Le azioni della chat (entrare, uscire, salvare, correggere...) ora partono
// direttamente dal browser: vedi chat-db.ts.

// Staff: accende o spegne l'invisibilita' (serve il permesso "staff.invisibile")
export async function setInvisible(on: boolean): Promise<{ error?: string }> {
  const { supabase } = await getStaffContext();
  const { error } = await supabase.rpc("set_invisible", { p_on: on });
  return error ? { error: error.message } : {};
}
