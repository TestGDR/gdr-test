import type { Metadata } from "next";
import { Cinzel, Lora } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const title = Cinzel({ variable: "--font-title", subsets: ["latin"] });
const body = Lora({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GDR Play By Chat",
  description: "Gioco di ruolo play by chat",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${title.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
