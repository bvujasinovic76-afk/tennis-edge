import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxySession";

// Next 16 renamed Middleware to Proxy. This keeps the Supabase auth session fresh on navigations.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on all routes except static assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
