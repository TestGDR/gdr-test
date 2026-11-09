import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { ACCESS_COOKIE, getClientIp, logAccess } from "@/lib/access-log";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";

const PUBLIC_PATHS = ["/", "/login", "/auth", "/legale", "/sospeso"];

// Rinnova la sessione Supabase a ogni richiesta e protegge le pagine riservate
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const isLoggedIn = !!userId;

  // Utente loggato che si collega da un IP diverso dall'ultimo registrato
  const ip = getClientIp(request.headers);
  if (userId && ip) {
    const accessKey = `${userId}|${ip}`;
    if (request.cookies.get(ACCESS_COOKIE)?.value !== accessKey) {
      response.cookies.set(ACCESS_COOKIE, accessKey, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
      event.waitUntil(
        logAccess({ userId, event: "accesso", ip, userAgent: request.headers.get("user-agent") }),
      );
    }
  }

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/")),
  );

  if (!isLoggedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Il proxy e' una funzione di Vercel: ogni richiesta che passa di qui costa.
  // Restano fuori file statici, immagini, suoni, font, dati, i file dell'app
  // installabile, il controllo della versione e i prefetch dei link (la pagina
  // vera, al clic, ripassa di qui; l'accesso lo ricontrolla comunque il layout)
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|robots.txt|sitemap.xml|api/versione|icons/|maps/|sounds/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|ogg|mp4|webm|json|txt|xml|webmanifest|woff|woff2|ttf|otf)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
