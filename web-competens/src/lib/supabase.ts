import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Dev-only diagnostics — remove before production
if (import.meta.env.DEV) {
  console.log("[Supabase] URL loaded:", supabaseUrl || "⛔ MISSING");
  console.log("[Supabase] Key prefix:", supabaseAnonKey ? supabaseAnonKey.slice(0, 12) + "…" : "⛔ MISSING");
  if (supabaseAnonKey && !supabaseAnonKey.startsWith("eyJ")) {
    console.error("[Supabase] ❌ Anon key is NOT a valid JWT. Go to Supabase Dashboard → Settings → API and copy the 'anon public' key (starts with eyJ).");
  }
}

/** Safe Supabase client — returns null when credentials are missing or invalid. */
function createSafeClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[Supabase] Missing URL or anon key — client disabled.");
    return null;
  }
  try {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    console.error("[Supabase] Failed to create client:", err);
    return null;
  }
}

export const supabase = createSafeClient();
