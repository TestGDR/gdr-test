import { createClient } from "@/lib/supabase/server";

export type SignupState = { open: boolean; message: string };

// Iscrizioni aperte o chiuse (Gestione -> Iscrizioni). Se la tabella non
// esiste ancora (migrazione 0153) le iscrizioni restano aperte.
export async function getSignupState(): Promise<SignupState> {
  const supabase = await createClient();
  const { data } = await supabase.from("signup_settings").select("open, message").maybeSingle();
  return { open: data?.open !== false, message: (data?.message as string | undefined) ?? "" };
}
