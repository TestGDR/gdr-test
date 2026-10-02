import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

// Le macroaree si aprono sulla mappa, in una modale: i vecchi link portano li'
export default async function LuogoPage({ params }: PageProps<"/luogo/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: location } = await supabase.from("locations").select("map_id").eq("id", id).maybeSingle();
  if (!location) notFound();
  redirect(`/mappa?id=${location.map_id}&luogo=${id}`);
}
