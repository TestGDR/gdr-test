import Link from "next/link";
import { GameArea } from "@/components/game/GameShell";
import { requirePermission } from "@/lib/staff";
import ChatSettingsEditor from "./ChatSettingsEditor";

export default async function ChatSettingsPage() {
  const { supabase } = await requirePermission("mondo.gestire");
  const { data } = await supabase
    .from("chat_settings")
    .select("max_length")
    .maybeSingle();

  return (
    <div className="mx-auto max-w-3xl">
      <GameArea title="Chat" />
      <Link href="/gestione" className="text-sm text-muted hover:text-accent">
        ← Gestione
      </Link>
      <h1 className="mt-1 mb-2 font-serif text-3xl tracking-wide text-accent">
        Chat
      </h1>
      <p className="mb-6 text-sm text-muted">
        Impostazioni delle chat di gioco.
      </p>
      <ChatSettingsEditor
        maxLength={(data?.max_length as number | undefined) ?? null}
      />
    </div>
  );
}
