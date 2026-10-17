'use client'

import { useId, useState, type FormEvent } from 'react'
import { isIsolatedEnvironment } from '@/lib/preview-mode'

// The design's local success toggle is a prototype. Until a subscription service
// exists, hand off a request to the user's email app without claiming enrolment.
export default function EmailCapture() {
  const id = useId()
  const [requested, setRequested] = useState(false)
  const isolated = isIsolatedEnvironment()
  function requestAlerts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '')
    const body = `Please let me know when price-drop alerts are available.\nMy email address: ${email}`
    window.location.href = `mailto:help@theliftinglab.co.uk?subject=${encodeURIComponent('Price-drop alerts request')}&body=${encodeURIComponent(body)}`
    setRequested(true)
  }
  const fields = <>
    <label className="sr-only" htmlFor={`${id}-email`}>Email address</label>
    <input id={`${id}-email`} name="email" type="email" autoComplete="email" required disabled={isolated} placeholder="you@example.com" aria-describedby={`${id}-hint`} />
    <button type={isolated ? 'button' : 'submit'} disabled={isolated} className="tll-btn tll-btn-primary">Request alerts</button>
  </>
  return <section className="tll-capture tll-onblack" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Get price-drop alerts</h3>
    <p>Request updates when price-drop alerts become available.</p>
    {isolated ? <div className="tll-capture-fields">{fields}</div> : <form className="tll-capture-fields" onSubmit={requestAlerts}>{fields}</form>}
    <p id={`${id}-hint`}>{isolated ? 'Alerts requests are disabled in this preview. No email will be sent.' : 'Opens your email app to send a request. Automatic alerts are not available yet.'}</p>
    {requested && <p className="tll-ok" role="status">Finish sending in your email app. This form has not subscribed you.</p>}
  </section>
}
