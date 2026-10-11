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

// Modalita' master: minimo e massimo di caratteri delle azioni in questa chat
// (max null = la spegne). Solo master, moderatori e admin: lo controlla il database
export async function setMasterMode(
  roomId: string,
  characterId: string,
  min: number,
  max: number | null,
): Promise<{ error?: string }> {
  const { supabase } = await getStaffContext();
  const { error } = await supabase.rpc("set_master_mode", {
    p_room: roomId,
    p_character: characterId,
    p_min: min,
    p_max: max,
  });
  return error ? { error: error.message } : {};
}

// Salva la giocata in corso nell'archivio di chi la salva (prima di uscire)
export async function saveGame(
  roomId: string,
  characterId: string,
): Promise<{ error?: string }> {
  const { supabase } = await getStaffContext();
  const { error } = await supabase.rpc("save_game", {
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
