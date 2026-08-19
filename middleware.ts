import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isLocalMode } from "@/lib/config-browser";

const PUBLIC_PATHS = ["/login"];
const PUBLIC_API = ["/api/gmail/webhook", "/api/gmail/callback"];

export async function middleware(request: NextRequest) {
  // Modo local: sin login, todo abierto
  if (isLocalMode) {
    return NextResponse.next();
  }

  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublicApi = PUBLIC_API.some((p) => pathname.startsWith(p));

  if (!user && !PUBLIC_PATHS.some((p) => pathname.startsWith(p)) && !pathname.startsWith("/api/auth") && !isPublicApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/login") && !isPublicApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};