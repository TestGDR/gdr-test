"use client";

import { createClient } from "@/lib/supabase/client";

// Azioni della chat chiamate direttamente dal browser: sono solo funzioni del
// database (i controlli li fa lui, con l'utente collegato). Prima passavano da
// una funzione di Vercel, che costava una chiamata in piu' ogni volta.
const supabase = createClient();
const result = ({ error }: { error: { message: string } | null }) =>
  error ? { error: error.message } : {};

// Entra in giocata: da qui in poi si leggono e si scrivono le azioni della chat
export async function joinChat(roomId: string, characterId: string): Promise<{ error?: string }> {
  return result(await supabase.rpc("join_chat", { p_room: roomId, p_character: characterId }));
}

// Esci dalla chat: quando esce l'ultimo la chat si pulisce
export async function leaveChat(roomId: string, characterId: string): Promise<{ error?: string }> {
  return result(await supabase.rpc("leave_chat", { p_room: roomId, p_character: characterId }));
}

// Modalita' master: minimo e massimo di caratteri delle azioni in questa chat
// (max null = la spegne). Solo master, moderatori e admin: lo controlla il database
export async function setMasterMode(
  roomId: string,
  characterId: string,
  min: number,
  max: number | null,
): Promise<{ error?: string }> {
  return result(
    await supabase.rpc("set_master_mode", { p_room: roomId, p_character: characterId, p_min: min, p_max: max }),
  );
}

// Salva la giocata in corso nell'archivio di chi la salva (prima di uscire)
export async function saveGame(roomId: string, characterId: string): Promise<{ error?: string }> {
  return result(await supabase.rpc("save_game", { p_room: roomId, p_character: characterId }));
}

// Correzione della propria azione: una sola volta, entro 5 minuti (lo controlla il database)
export async function editMessage(id: number, content: string): Promise<{ error?: string }> {
  return result(await supabase.rpc("edit_chat_message", { p_id: id, p_content: content }));
}

// Cancella un'azione dalla chat: solo moderatori e admin (lo controlla il database)
export async function deleteMessage(id: number): Promise<{ error?: string }> {
  return result(await supabase.rpc("delete_chat_message", { p_id: id }));
}
