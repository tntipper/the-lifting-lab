'use client'

import { useId, useState, type FormEvent } from 'react'

// The design's local success toggle is a prototype. Until a subscription service
// exists, hand off a request to the user's email app without claiming enrolment.
export default function EmailCapture() {
  const id = useId()
  const [requested, setRequested] = useState(false)
  function requestAlerts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '')
    const body = `Please let me know when price-drop alerts are available.\nMy email address: ${email}`
    window.location.href = `mailto:hello@theliftinglab.co.uk?subject=${encodeURIComponent('Price-drop alerts request')}&body=${encodeURIComponent(body)}`
    setRequested(true)
  }
  return <section className="tll-capture tll-onblack" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Get price-drop alerts</h3>
    <p>Request updates when price-drop alerts become available.</p>
    <form onSubmit={requestAlerts}>
      <label className="sr-only" htmlFor={`${id}-email`}>Email address</label>
      <input id={`${id}-email`} name="email" type="email" autoComplete="email" required placeholder="you@example.com" aria-describedby={`${id}-hint`} />
      <button type="submit" className="tll-btn tll-btn-primary">Request alerts</button>
    </form>
    <p id={`${id}-hint`}>Opens your email app to send a request. Automatic alerts are not available yet.</p>
    {requested && <p className="tll-ok" role="status">Finish sending in your email app. This form has not subscribed you.</p>}
  </section>
}
