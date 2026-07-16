import { createClient } from "@/lib/supabase/server";

/** Server component: shows the logged-in user's email + sign out, or a login link. */
export default async function AuthStatus() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <a href="/login" className="text-sm font-medium text-accent hover:underline">
        Prijava / Nalog
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted truncate max-w-[180px]" title={user.email ?? ""}>
        {user.email}
      </span>
      <form action="/auth/signout" method="post">
        <button type="submit" className="text-sm text-ink-soft hover:text-risk transition-colors">
          Odjava
        </button>
      </form>
    </div>
  );
}
