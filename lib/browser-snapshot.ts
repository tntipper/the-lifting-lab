'use client'

import { useSyncExternalStore } from 'react'

// Keep browser-only reads consistent with the initial server render.
// Reads must return stable snapshots; live sources need a real subscription.
const subscribe = () => () => {}
export function useBrowserSnapshot<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribe, read, () => serverValue)
}
