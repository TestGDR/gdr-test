import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Utente bannato con una sessione ancora aperta: esce e vede perche'
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const url = new URL("/sospeso", request.url);
  if (user) {
    const { data } = await supabase.from("profiles").select("banned_until, ban_reason").eq("id", user.id).single();
    if (data?.banned_until) url.searchParams.set("fino", data.banned_until);
    if (data?.ban_reason) url.searchParams.set("motivo", data.ban_reason);
    await supabase.rpc("leave_online");
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(url);
}
