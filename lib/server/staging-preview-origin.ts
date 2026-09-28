/**
 * The protected Git-branch alias is the only browser origin registered with
 * the staging providers.  Deployment URLs are deliberately not accepted here:
 * they are immutable source evidence, while this alias is the reviewed return
 * origin shared by the disabled and enabled activation phases.
 */
export const STAGING_REVIEWED_PREVIEW_ORIGIN =
  'https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app'

export function isStagingReviewedPreviewOrigin(value: unknown): value is typeof STAGING_REVIEWED_PREVIEW_ORIGIN {
  return value === STAGING_REVIEWED_PREVIEW_ORIGIN
}
