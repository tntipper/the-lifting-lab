/** Compatibility name; all margin arithmetic lives in the canonical pricing policy. */
// @ts-expect-error Explicit extension required by Node's type-strip runtime.
export { calculateProposalMargin as signoffMargin } from './commerce/pricing-policy.ts'
