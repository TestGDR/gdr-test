"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

// Link verso le chat e la mappa. Prima preparava la pagina appena il mouse ci
// passava sopra: ogni passaggio era una chiamata al server (consumi di Vercel).
// Ora la pagina si carica solo al clic (mentre arriva si vede "Caricamento...").
export default function PrefetchLink(props: ComponentProps<typeof Link> & { href: string }) {
  return <Link prefetch={false} {...props} />;
}
