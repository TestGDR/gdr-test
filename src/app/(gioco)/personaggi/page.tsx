import { GameArea } from "@/components/game/GameShell";
import { requireUser } from "@/lib/supabase/server";
import type { Character } from "@/lib/types";
import CharacterForm from "./CharacterForm";
import { deleteCharacter } from "./actions";

export default async function PersonaggiPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("characters")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at");
  const characters = (data ?? []) as Character[];

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_380px]">
      <section>
        <GameArea title="Personaggi" />
        <h1 className="mb-4 font-serif text-3xl text-accent">I tuoi personaggi</h1>
        {characters.length === 0 && (
          <p className="text-muted">Non hai ancora nessun personaggio. Creane uno per iniziare!</p>
        )}
        <ul className="space-y-4">
          {characters.map((c) => (
            <li key={c.id} className="panel flex gap-4">
              {c.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.avatar_url}
                  alt={c.name}
                  className="h-20 w-20 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-background font-serif text-3xl text-accent">
                  {c.name[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-xl">{c.name}</h2>
                <p className="mt-1 whitespace-pre-line text-sm text-muted">
                  {c.description || "Nessuna descrizione."}
                </p>
              </div>
              <form action={deleteCharacter.bind(null, c.id)}>
                <button className="text-sm text-muted hover:text-red-400">Elimina</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
      <aside>
        <CharacterForm />
      </aside>
    </div>
  );
}
