const HTML_JSON_ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

/**
 * Serialize JSON for a script's HTML raw-text context. JSON.stringify alone
 * leaves </script> intact, allowing data to terminate the surrounding element.
 * JSON escapes keep the payload parseable without changing its values; HTML
 * entities would instead become literal text inside the script.
 *
 * This is not a sanitizer for arbitrary HTML, CSS, URLs or executable scripts.
 */
export function serializeJsonForHtml(value: unknown): string {
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new TypeError('The value must be JSON serializable')
  }

  return json.replace(/[<>&\u2028\u2029]/g, character => HTML_JSON_ESCAPES[character])
}
