// Project references are public endpoint identifiers, not credentials.
const productionProject = "wrhgscovsgsudtedbljr";

/** Fail the build before a Vercel preview can use the live customer database. */
export function assertPreviewIsolation(env) {
  if (env.VERCEL_ENV !== "preview") return;

  const stagingProject = env.TLL_STAGING_SUPABASE_PROJECT_REF;
  if (env.NEXT_PUBLIC_TLL_ENVIRONMENT !== "staging" ||
      !/^[a-z0-9]{20}$/.test(stagingProject ?? "") ||
      stagingProject === productionProject) {
    throw new Error("Preview deployment requires an explicitly isolated staging Supabase project.");
  }

  let endpoint;
  try {
    endpoint = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    throw new Error("Preview deployment requires a valid staging Supabase URL.");
  }
  if (endpoint.protocol !== "https:" || endpoint.hostname !== `${stagingProject}.supabase.co` ||
      endpoint.username || endpoint.password || endpoint.port || endpoint.search || endpoint.hash ||
      endpoint.pathname !== "/") {
    throw new Error("Preview Supabase URL does not match the isolated staging project.");
  }
}
