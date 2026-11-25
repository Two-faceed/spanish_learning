import { createClient } from "@supabase/supabase-js";

function resolveSupabaseEnv(): { url: string | undefined; key: string | undefined } {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return { url, key };
}

export function isServerSupabaseConfigured(): boolean {
  const { url, key } = resolveSupabaseEnv();
  return Boolean(
    url &&
      key &&
      url.startsWith("http") &&
      !url.includes("your-project.supabase.co")
  );
}

export function getSupabaseServerAdminClient() {
  if (!isServerSupabaseConfigured()) return null;
  const { url, key } = resolveSupabaseEnv();

  return createClient(url!, key!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
