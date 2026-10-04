import type { Metadata, Viewport } from "next";
import { Cinzel, Lora, Open_Sans } from "next/font/google";
import "./globals.css";

const title = Cinzel({ variable: "--font-title", subsets: ["latin"] });
const body = Lora({ variable: "--font-body", subsets: ["latin"] });
const plain = Open_Sans({ variable: "--font-readable", subsets: ["latin"] }); // senza grazie (elenchi, presenti)

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
    <html lang="it" className={`${title.variable} ${body.variable} ${plain.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
