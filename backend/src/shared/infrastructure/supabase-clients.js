import { createClient } from "@supabase/supabase-js"

export function createSupabaseClients(config) {
  const createAuthClient = () => createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const authClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })

  const serviceClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })

  return { authClient, createAuthClient, serviceClient }
}
