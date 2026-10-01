import Header from "@/components/Header";

// Area pubblica: home, accesso, documenti legali
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="bar border-t px-4 py-4">
        <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-muted">
          Progetto amatoriale e no-profit a carattere narrativo (fanfiction). Tutti i diritti
          appartengono a George R.R. Martin. Nessuna violazione del copyright intesa.
        </p>
      </footer>
    </>
  );
}
