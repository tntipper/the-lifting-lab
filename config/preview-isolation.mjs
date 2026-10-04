// Project references are public endpoint identifiers, not credentials.
const productionProject = "wrhgscovsgsudtedbljr";

/** Reserved non-resolving origin; all synthetic SDK requests are also blocked. */
export const SYNTHETIC_PREVIEW_URL = "https://tll-preview.invalid";
const syntheticPreviewUrl = SYNTHETIC_PREVIEW_URL;
const syntheticPreviewAnonKey = "tll-preview-synthetic-public-key";

function parseSupabaseOrigin(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function stagingUrlMatches(env, stagingProject) {
  const endpoint = parseSupabaseOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!endpoint) return false;
  return endpoint.protocol === "https:" &&
    endpoint.hostname === `${stagingProject}.supabase.co` &&
    !endpoint.username && !endpoint.password && !endpoint.port &&
    !endpoint.search && !endpoint.hash && endpoint.pathname === "/";
}

function isValidStagingConfig(env) {
  const stagingProject = env.TLL_STAGING_SUPABASE_PROJECT_REF;
  return env.NEXT_PUBLIC_TLL_ENVIRONMENT === "staging" &&
    /^[a-z0-9]{20}$/.test(stagingProject ?? "") &&
    stagingProject !== productionProject &&
    stagingUrlMatches(env, stagingProject);
}

function pointsAtProduction(env) {
  const ref = env.TLL_STAGING_SUPABASE_PROJECT_REF ?? "";
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return ref === productionProject || url.includes(`${productionProject}.supabase.co`);
}

function claimsExplicitStaging(env) {
  return env.NEXT_PUBLIC_TLL_ENVIRONMENT === "staging" ||
    Boolean(env.TLL_STAGING_SUPABASE_PROJECT_REF);
}

/** Force Preview onto a synthetic non-production Supabase identity. */
export function applySyntheticPreviewEnv(env) {
  env.NEXT_PUBLIC_TLL_ENVIRONMENT = "synthetic-preview";
  delete env.TLL_STAGING_SUPABASE_PROJECT_REF;
  env.NEXT_PUBLIC_SUPABASE_URL = syntheticPreviewUrl;
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = syntheticPreviewAnonKey;
}

/**
 * Keep Vercel Preview off the live customer database.
 * Accept an explicit isolated staging project, or rewrite inherited /
 * missing Preview config to a synthetic non-production identity so the
 * UI can still build. Mis-declared staging markers still fail closed.
 */
export function assertPreviewIsolation(env) {
  if (env.VERCEL_ENV !== "preview") return;
  if (isValidStagingConfig(env)) return;
  if (env.NEXT_PUBLIC_TLL_ENVIRONMENT === "synthetic-preview") {
    applySyntheticPreviewEnv(env);
    return;
  }

  // Blank Preview env or inherited production → synthetic non-prod build.
  if (!claimsExplicitStaging(env) || pointsAtProduction(env)) {
    applySyntheticPreviewEnv(env);
    return;
  }

  const stagingProject = env.TLL_STAGING_SUPABASE_PROJECT_REF;
  if (env.NEXT_PUBLIC_TLL_ENVIRONMENT !== "staging" ||
      !/^[a-z0-9]{20}$/.test(stagingProject ?? "") ||
      stagingProject === productionProject) {
    throw new Error("Preview deployment requires an explicitly isolated staging Supabase project.");
  }

  const endpoint = parseSupabaseOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!endpoint) {
    throw new Error("Preview deployment requires a valid staging Supabase URL.");
  }
  throw new Error("Preview Supabase URL does not match the isolated staging project.");
}
