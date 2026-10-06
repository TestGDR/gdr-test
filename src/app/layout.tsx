import type { Metadata, Viewport } from "next";
import { Cinzel, Lora, Open_Sans } from "next/font/google";
import "./globals.css";

// Titoli, sezioni e nomi: Cinzel. Tutti gli altri testi: Open Sans (sans-serif
// pulito e leggibile). Lora resta disponibile nell'editor di testo
const title = Cinzel({ variable: "--font-title", subsets: ["latin"] });
const body = Open_Sans({ variable: "--font-body", subsets: ["latin"] });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Westeros GDR",
  description: "Gioco di ruolo play by chat amatoriale ambientato a Westeros",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0a0a",
};

// Layout base: le aree pubblica e di gioco hanno ciascuna il proprio layout
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${title.variable} ${body.variable} ${lora.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
