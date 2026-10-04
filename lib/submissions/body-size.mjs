/** Browser-safe shared byte limit. No server configuration or Node imports. */
export const SUBMISSION_BODY_BYTE_LIMIT = 16384

/** @param {string} serializedBody @returns {string | null} */
export function submissionSizeError(serializedBody) {
  return new TextEncoder().encode(serializedBody).byteLength > SUBMISSION_BODY_BYTE_LIMIT
    ? 'Your submission is too long. Please shorten the text and try again.'
    : null
}
