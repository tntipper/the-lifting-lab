/** Public Preview-only markers for the staging Customer Account sign-in entry. */

export const STAGING_CUSTOMER_SIGN_IN_PATH = '/auth/customer'
export const ORDINARY_AUTH_PATH = '/auth'

/** Build-time public flags only. Does not arm server runtime or read secrets. */
export function stagingCustomerUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TLL_ENVIRONMENT === 'staging'
    && process.env.NEXT_PUBLIC_TLL_STAGING_CUSTOMER === 'enabled'
}

/** Primary Sign In / account entry for signed-out users. */
export function accountSignInHref(): string {
  return stagingCustomerUiEnabled() ? STAGING_CUSTOMER_SIGN_IN_PATH : ORDINARY_AUTH_PATH
}
