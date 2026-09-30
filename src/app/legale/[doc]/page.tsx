import { notFound } from "next/navigation";
import { LEGAL_DOCS, LEGAL_VERSION, type LegalDocId } from "@/lib/legal";

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export default async function LegalPage({ params }: PageProps<"/legale/[doc]">) {
  const { doc } = await params;
  const legalDoc = LEGAL_DOCS[doc as LegalDocId];
  if (!legalDoc) notFound();

  return (
    <article className="panel mx-auto max-w-3xl leading-relaxed">
      <h1 className="font-serif text-3xl text-accent">{legalDoc.title}</h1>
      <p className="mb-4 text-sm text-muted">Versione del {LEGAL_VERSION}</p>
      {legalDoc.body}
    </article>
  );
}
