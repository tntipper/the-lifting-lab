// Collector referrers may omit their scheme. Resolve them without removing
// query or fragment data: the caller must still reject both and raw markers.
export function collectorUrl(value, origin) {
  return new URL(value, origin)
}
