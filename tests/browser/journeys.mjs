import assert from 'node:assert/strict'
import { resolve } from 'node:path'

const listed = [
  ['whey', 19.71, 'SyntheticExtraLongUnbrokenProductName'.repeat(3)],
  ['creatine', 0.29, 'Synthetic exact-pence companion'],
  ['eaas', null, 'Synthetic unknown-price amino acids'],
  ['whey-isolate', 0, 'Synthetic zero-price isolate'],
  ['pre-workout', '10', 'Synthetic malformed-price pre-workout'],
  ['casein', 150, 'Synthetic over-budget casein'],
  ['vitamin', 10, 'Synthetic vitamin pack'],
  ['vitamin-d', 1e20, 'Synthetic unsafe-price vitamin D'],
  ['gut-digestion', 0.004, 'Synthetic sub-penny gut pack'],
  ['hormone-support', 0.01, 'Synthetic hormone claim under review'],
  ['zma', 0.01, 'Synthetic ZMA claim under review'],
].map(([category, retail_price, name], index) => ({
  id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  name, brand: 'SyntheticLongUnbrokenBrandName'.repeat(2), category, retail_price, score: 90,
}))

async function focusIsInside(dialog) {
  assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, 'Dialog focus escaped')
}

export async function verifyShareResults(page) {
  const outcomes = [
    { name: 'success', category: 'zma', score: 99, assessment: 'Under review', status: 200, body: { pointsAwarded: 25 }, message: '+25 points claimed!' },
    { name: 'zero', category: 'creatine', score: 0, assessment: 'Not assessed', status: 200, body: { pointsAwarded: 0 }, message: 'No points were awarded.' },
    { name: 'http-error', category: 'creatine', score: 80, assessment: 'Legacy score 80/100', status: 503, body: {}, message: 'Your share claim could not be recorded.' },
    { name: 'network-error', category: 'creatine', score: null, assessment: 'Not assessed', message: 'Your share claim could not be recorded.' },
  ]
  for (const outcome of outcomes) {
    let captureRoute
    const pending = new Promise(resolveRoute => { captureRoute = resolveRoute })
    const handler = route => { captureRoute(route) }
    await page.route('**/api/share', handler)
    const captionHandler = route => {
      assert.equal(route.request().method(), 'GET')
      assert.deepEqual([...new URL(route.request().url()).searchParams.keys()], ['ids'])
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ products: [{
        id: '20000000-0000-4000-8000-000000000001', name: `Server record ${outcome.name}`, brand: 'Server fixture', category: outcome.category, score: outcome.score,
      }] }) })
    }
    await page.route('**/api/stack/assessments?*', captionHandler)
    const trigger = page.getByRole('button', { name: 'Open share fixture' })
    await trigger.focus(); await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Share & earn 25 pts' })
    await page.waitForFunction(expected => document.querySelector('textarea[aria-label="Share caption"]')?.value.includes(expected), outcome.assessment)
    const caption = await dialog.getByRole('textbox', { name: 'Share caption' }).inputValue()
    assert.match(caption, new RegExp(`Server record ${outcome.name}`))
    assert.doesNotMatch(caption, /evidence-based UK|Synthetic product with|Excellent|Good dosing/)
    assert.equal(new URL(await dialog.getByRole('link', { name: 'Share on X' }).getAttribute('href')).searchParams.get('text'), caption)
    const status = dialog.getByRole('status')
    const action = dialog.getByRole('button', { name: "I've shared this · +25 pts" })
    await action.focus(); await page.keyboard.press('Enter')
    const route = await pending
    try {
      assert.equal(route.request().method(), 'POST')
      assert.deepEqual(route.request().postDataJSON(), { productId: '20000000-0000-4000-8000-000000000001' })
      await status.filter({ hasText: 'Recording your share claim…' }).waitFor()
      assert.equal(await status.getAttribute('aria-live'), 'polite')
      assert.equal(await status.getAttribute('aria-atomic'), 'true')
      assert.equal(await status.evaluate(element => element === document.activeElement), true)
      assert.equal(await dialog.getByRole('button', { name: 'Claiming…' }).isDisabled(), true)
      // A focused non-tabstop status at the end must not Tab into browser chrome.
      for (const key of ['Tab', 'Shift+Tab']) {
        await status.focus(); await page.keyboard.press(key); await focusIsInside(dialog)
      }
      await status.focus()
      if (outcome.status) await route.fulfill({ status: outcome.status, contentType: 'application/json', body: JSON.stringify(outcome.body) })
      else await route.abort('failed')
      await status.filter({ hasText: outcome.message }).waitFor()
      assert.equal(await status.evaluate(element => element === document.activeElement), true)
      if (outcome.name.includes('error')) assert.equal(await action.isEnabled(), true)
      else assert.equal(await action.count(), 0)
      for (let index = 0; index < 24; index++) {
        await page.keyboard.press(index < 12 ? 'Tab' : 'Shift+Tab')
        await focusIsInside(dialog)
      }
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' })
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true)
    } finally {
      await route.abort().catch(() => {})
      await page.unroute('**/api/share', handler)
    }
  }
}

async function focusedHeading(page, name) {
  const heading = page.getByRole('heading', { level: 2, name })
  await heading.waitFor()
  assert.equal(await heading.evaluate(element => element === document.activeElement), true, `Step heading did not receive focus: ${name}`)
}

async function finishWizard(page) {
  await page.getByRole('button', { name: 'Next →', exact: true }).click()
  await focusedHeading(page, 'How hard do you train?')
  await page.getByRole('button', { name: /1–3 sessions a week/ }).click()
  await page.getByRole('button', { name: 'Next →', exact: true }).click()
  await focusedHeading(page, 'Already taking any of these?')
  await page.getByRole('button', { name: 'See my stack →' }).click()
  await focusedHeading(page, /products? for Build Muscle \+ Health & Wellbeing/)
}

export async function verifyWizard(page, origin, width, resultDir) {
  await page.route('**/api/products?sort=score', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listed) }))
  await page.goto(`${origin}/wizard`)
  const next = page.getByRole('button', { name: 'Next →', exact: true })
  assert.equal(await next.isDisabled(), true)
  for (const goal of ['Build Muscle', 'Health & Wellbeing']) {
    const choice = page.getByRole('button', { name: new RegExp(`^${goal}`) })
    await choice.focus(); await page.keyboard.press('Space')
    assert.equal(await choice.getAttribute('aria-pressed'), 'true')
  }
  await next.focus(); await page.keyboard.press('Enter')
  await focusedHeading(page, 'What is your initial pack budget?')
  const slider = page.getByRole('slider', { name: 'Initial pack budget', exact: true })
  const custom = page.getByRole('spinbutton', { name: 'Custom initial pack budget in pounds' })
  assert.equal(await slider.getAttribute('aria-valuetext'), '£120 for packs')
  await page.getByText('Delivery is additional.', { exact: false }).waitFor()
  // Real keystrokes expose eager min-clamping that fill() would conceal.
  await custom.fill(''); await custom.pressSequentially('95.50'); await custom.press('Tab')
  assert.equal(await custom.inputValue(), '95.5')
  assert.equal(await slider.getAttribute('aria-valuetext'), '£95.5 for packs')
  await custom.fill('20'); await custom.press('Tab')
  await page.getByRole('button', { name: '← Back' }).click()
  await focusedHeading(page, 'What are your goals?')
  await next.click(); await focusedHeading(page, 'What is your initial pack budget?')
  assert.equal(await custom.inputValue(), '20')
  await finishWizard(page)
  await page.getByText('Listed pack subtotal:', { exact: false }).waitFor()
  await page.getByText('£20.00', { exact: true }).waitFor()
  await page.getByText('Delivery and checkout adjustments are additional.', { exact: false }).waitFor()
  await page.getByText('Monthly spending needs the pack contents', { exact: false }).waitFor()
  for (const [index, product] of listed.entries()) {
    assert.equal(await page.getByRole('link', { name: product.name, exact: true }).count(), index < 2 ? 1 : 0, `Finite-budget eligibility mismatch for ${product.category}`)
  }
  assert.equal(await page.getByRole('button', { name: 'Add 2 to My Stack', exact: true }).count(), 1)
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }))
  assert.ok(dimensions.scroll <= dimensions.width + 1, `Wizard long names overflow ${width}px: ${dimensions.scroll}`)
  for (const label of ['Browse alternatives', '+ Stack']) {
    const controls = page.getByRole(label === '+ Stack' ? 'button' : 'link', { name: label, exact: true })
    for (const control of await controls.all()) {
      const box = await control.boundingBox()
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.height >= 44, `Wizard action clipped or undersized: ${label}`)
    }
  }
  await page.screenshot({ path: resolve(resultDir, `${width}-wizard-results.png`), fullPage: true })
  await page.getByRole('button', { name: 'Add 2 to My Stack', exact: true }).click()
  const stackLink = page.getByRole('link', { name: 'View My Stack →', exact: true })
  await stackLink.waitFor()
  assert.equal(await stackLink.evaluate(element => element === document.activeElement), true, 'Adding a complete stack lost focus when its action changed')
  await page.getByRole('button', { name: 'Start over' }).click()
  await focusedHeading(page, 'What are your goals?')
  assert.equal(await next.isDisabled(), true)
  for (const goal of ['Build Muscle', 'Health & Wellbeing']) await page.getByRole('button', { name: new RegExp(`^${goal}`) }).click()
  await next.click(); await focusedHeading(page, 'What is your initial pack budget?')
  assert.equal(await custom.inputValue(), '120')
  await slider.focus(); await page.keyboard.press('End')
  assert.equal(await slider.getAttribute('aria-valuetext'), 'No limit')
  await finishWizard(page)
  await page.getByText('A complete pack subtotal is unavailable for this selection.', { exact: false }).waitFor()
  assert.equal(await page.getByText('Listed pack subtotal:', { exact: false }).count(), 0)
  assert.equal(await page.getByRole('link', { name: listed[2].name, exact: true }).count(), 1)
  for (const product of listed.filter(p => ['hormone-support', 'zma'].includes(p.category))) {
    assert.equal(await page.getByRole('link', { name: product.name, exact: true }).count(), 0, 'Under-review score entered a recommended wizard stack')
  }
}
