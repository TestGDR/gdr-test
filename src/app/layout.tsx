import type { Metadata } from "next";
import { Cinzel, Lora } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const title = Cinzel({ variable: "--font-title", subsets: ["latin"] });
const body = Lora({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Westeros GDR",
  description: "Gioco di ruolo play by chat amatoriale ambientato a Westeros",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${title.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="bar border-t px-4 py-4">
          <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-muted">
            Westeros GDR è un progetto amatoriale di Gioco di Ruolo (GDR o RPG) non a scopo di
            lucro. I temi trattati e le vicende sono solo di natura esclusivamente narrativa. Ogni
            diritto originale appartiene a George R.R. Martin e non si intende violare in alcun modo
            il possesso della proprietà intellettuale. Tutti gli avvenimenti presenti all&apos;interno
            del gioco sono da prendere come una FanFiction.
          </p>
        </footer>
      </body>
    </html>
  );
}
