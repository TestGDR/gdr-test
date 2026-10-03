import Link from "next/link";

// Pagina mostrata a chi e' stato bannato
export default async function SospesoPage({ searchParams }: PageProps<"/sospeso">) {
  const { fino, motivo } = await searchParams;
  const until = typeof fino === "string" ? new Date(fino) : null;
  const permanent = !until || Number.isNaN(until.getTime()) || until.getFullYear() > 9000;

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="font-serif text-3xl tracking-wide text-accent">Account sospeso</h1>
      <p className="mt-4 text-foreground">
        {permanent
          ? "Il tuo account è stato sospeso in modo permanente."
          : `Il tuo account è sospeso fino al ${until!.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" })} alle ${until!.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}.`}
      </p>
      {typeof motivo === "string" && motivo && (
        <p className="mt-3 border border-border bg-black/40 px-4 py-3 text-sm text-muted">
          Motivo: <span className="text-foreground">{motivo}</span>
        </p>
      )}
      <p className="mt-6 text-sm text-muted">Per chiarimenti contatta lo staff.</p>
      <Link href="/" className="btn-ghost mt-8 inline-block">
        Torna alla home
      </Link>
    </div>
  );
}
