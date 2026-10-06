import { OWNER_SUCCESSOR_WINDOW_ID, OWNER_SUCCESSOR_EDGE_REVISION } from '../../scripts/staging-owner-successor-registration.mjs'
export const start = Date.parse('2030-01-01T12:00:00.000Z')
export const freshWindowInput = () => ({ pins: { sourceSha: 'a'.repeat(40), reviewedSha: 'a'.repeat(40),
  manifestSha256: 'b'.repeat(64), dependencySha256: 'c'.repeat(64), windowId: OWNER_SUCCESSOR_WINDOW_ID,
  edgeRevision: OWNER_SUCCESSOR_EDGE_REVISION }, startedAtMs: start, expiresAtMs: start + 45 * 60_000,
  predecessor: { windowId: 'd5180b08-79ee-43e8-96d4-4f73621fecbf', expiresAt: '2026-09-28T21:47:00.000Z',
    state: 'retired', runtimeSessions: 0, controlsEnabled: false, providerEnabled: false, retiredRoles: 5, provenance: 'SYNTHETIC_STUB' } })
