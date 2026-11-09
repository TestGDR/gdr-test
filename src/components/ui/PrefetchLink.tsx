import Link from "next/link";
import type { ComponentProps } from "react";

// Link verso chat e mappa. Prima scaricava la pagina intera al passaggio del mouse:
// ogni passaggio era una chiamata alle funzioni di Vercel. Ora si carica al clic.
export default function PrefetchLink(props: ComponentProps<typeof Link>) {
  return <Link prefetch={false} {...props} />;
}
