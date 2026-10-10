"use server";

import { getStaffContext } from "@/lib/staff";

// Entra in giocata: da qui in poi si leggono e si scrivono le azioni della chat
export async function joinChat(
  roomId: string,
  characterId: string,
): Promise<{ error?: string }> {
  const { supabase } = await getStaffContext();
  const { error } = await supabase.rpc("join_chat", {
    p_room: roomId,
    p_character: characterId,
  });
  return error ? { error: error.message } : {};
}

// Esci dalla chat: quando esce l'ultimo la chat si pulisce
export async function leaveChat(
  roomId: string,
  characterId: string,
): Promise<{ error?: string }> {
  const { supabase } = await getStaffContext();
  const { error } = await supabase.rpc("leave_chat", {
    p_room: roomId,
    p_character: characterId,
  });
  return error ? { error: error.message } : {};
}

// Staff: accende o spegne l'invisibilita' (serve il permesso "staff.invisibile")
export async function setInvisible(on: boolean): Promise<{ error?: string }> {
  const { supabase } = await getStaffContext();
  const { error } = await supabase.rpc("set_invisible", { p_on: on });
  return error ? { error: error.message } : {};
}
