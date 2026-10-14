"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

// Link che prepara la pagina di destinazione (dati compresi) appena il mouse ci
// passa sopra, il dito la tocca o la tastiera ci arriva: al clic e' gia' pronta.
// Lo usano i link verso le chat e verso la mappa.
export default function PrefetchLink({ href, onMouseEnter, onTouchStart, onFocus, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  // "full": anche i dati della pagina, non solo la sua struttura
  const warm = () => router.prefetch(href, { kind: "full" } as unknown as Parameters<typeof router.prefetch>[1]);
  return (
    <Link
      href={href}
      onMouseEnter={(e) => (warm(), onMouseEnter?.(e))}
      onTouchStart={(e) => (warm(), onTouchStart?.(e))}
      onFocus={(e) => (warm(), onFocus?.(e))}
      {...props}
    />
  );
}
