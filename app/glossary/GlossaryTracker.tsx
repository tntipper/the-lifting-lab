'use client'

import { useEffect } from 'react'
import { track } from '@/lib/gtag'

// Fires a single GA4 view event on mount. Kept as a tiny client island so the
// glossary page itself stays a pure static server component (DB-free, never fails).
export default function GlossaryTracker() {
  useEffect(() => {
    track('glossary_view')
  }, [])
  return null
}
