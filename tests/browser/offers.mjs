import assert from 'node:assert/strict'
import { resolve } from 'node:path'

export async function verifyOfferLinks(page, origin, width, resultDir) {
  const externalRequests = []
  const externalRequest = request => {
    if (new URL(request.url()).origin !== origin) externalRequests.push(request.url())
  }
  page.on('request', externalRequest)
  const context = page.context()
  const originalPages = context.pages().length
  // Context routing also covers a popup's first request if a regression opens one.
  const blockExternal = route => new URL(route.request().url()).origin === origin ? route.fallback() : route.abort()
  await context.route('**/*', blockExternal)
  try {
    await page.goto(`${origin}/offers`)
    await page.getByRole('heading', { name: 'Isolated product listing acceptance' }).waitFor()
    await page.evaluate(() => {
      const activations = []
      Object.defineProperty(window, '__offerFixtureActivations', { value: activations, configurable: true })
      document.addEventListener('click', event => {
        const anchor = event.target.closest?.('[data-offer-case] a')
        if (!anchor) return
        // Exercise the real keyboard/click handler while preventing all navigation.
        event.preventDefault()
        activations.push({ href: anchor.href, target: anchor.target, label: anchor.getAttribute('aria-label') })
      }, true)
    })

    for (const layout of ['card', 'sticky']) {
      for (const state of ['listing', 'search', 'missing', 'own-shop']) {
        const row = page.locator(`[data-offer-layout="${layout}"][data-offer-case="${state}"]`)
        await row.scrollIntoViewIfNeeded()
        const result = row.locator('[data-offer-state]')
        assert.equal(await result.getAttribute('data-offer-state'), state === 'listing' ? 'listing' : state === 'search' ? 'search_only' : 'unavailable')
        const grid = row.locator('[data-offer-grid]')
        const dimensions = await grid.evaluate(element => ({
          clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
          columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
        }))
        assert.equal(dimensions.columns, 3, 'Offer fixture must exercise the existing three-column layout')
        assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${layout}/${state} action grid overflows at ${width}`)
        for (const element of [row, result, ...await result.locator('a,span').all()]) {
          const box = await element.boundingBox()
          assert.ok(box && box.width > 0 && box.height > 0 && box.x >= 0 && box.x + box.width <= width + 1, `${layout}/${state} offer text clipped at ${width}`)
          assert.equal(await element.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, `${layout}/${state} offer text overflows its own element`)
        }

        const previous = row.getByRole('button', { name: 'Compare fixture', exact: true })
        await previous.focus()
        await page.keyboard.press('Tab')
        const anchor = row.getByRole('link')
        if (state === 'missing' || state === 'own-shop') {
          assert.equal(await anchor.count(), 0)
          assert.equal(await result.getByText(state === 'missing' ? 'No verified offer' : 'Shop offer under review', { exact: true }).count(), 1)
          assert.equal(await result.locator('[tabindex],button,input,a').count(), 0, 'Unavailable offer must remain non-interactive')
          assert.equal(await result.evaluate(element => element.contains(document.activeElement)), false)
        } else {
          assert.equal(await anchor.count(), 1)
          assert.equal(await anchor.evaluate(element => element === document.activeElement), true, 'Keyboard traversal skipped the offer link')
          const action = state === 'listing' ? 'View retailer ↗' : 'Search retailer ↗'
          assert.equal(await anchor.textContent(), action)
          assert.equal(await anchor.innerText(), action.toUpperCase(), 'Visible action must preserve the existing uppercase button styling')
          assert.match(await anchor.getAttribute('aria-label'), state === 'listing' ? /^View listing at Amazon for Fixture / : /^Search Bulk for Fixture /)
          assert.match(await anchor.getAttribute('aria-label'), /Synthetic product with a long readable formula and flavour name \(opens in a new tab\)$/)
          assert.equal(await anchor.getAttribute('target'), '_blank')
          const rel = (await anchor.getAttribute('rel')).split(/\s+/)
          for (const attribute of ['noopener', 'noreferrer', 'nofollow', 'sponsored']) assert.ok(rel.includes(attribute))
          assert.match(await result.innerText(), state === 'listing' ? /Unverified listing · check pack and price · affiliate link/ : /Search results · affiliate link/)
          const target = new URL(await anchor.getAttribute('href'))
          if (state === 'listing') {
            assert.equal(target.hostname, 'www.amazon.co.uk')
            assert.equal(target.pathname, '/dp/B000000001')
            assert.equal(target.searchParams.get('th'), '1')
            assert.equal(target.searchParams.get('tag'), 'theliftinglab-21')
            assert.equal(target.searchParams.has('applyCode'), false)
          } else {
            assert.equal(target.hostname, 'www.awin1.com')
            const destination = new URL(target.searchParams.get('ued'))
            assert.equal(destination.hostname, 'www.bulk.com')
            assert.equal(destination.pathname, '/uk/search')
            assert.equal(destination.searchParams.get('q'), 'synthetic-fixture')
          }
          const box = await anchor.boundingBox()
          assert.ok(box && box.height >= 44 && box.width >= 44, `${layout}/${state} target below 44px at ${width}`)
          await page.keyboard.press('Enter')
          assert.equal(page.url(), `${origin}/offers`, 'A fixture link navigated')
          assert.equal(await anchor.evaluate(element => element === document.activeElement), true, 'Link activation lost keyboard focus')
          await page.keyboard.press('Shift+Tab')
          assert.equal(await previous.evaluate(element => element === document.activeElement), true, 'Reverse traversal skipped the adjacent control')
        }
      }
    }
    assert.equal(await page.evaluate(() => window.__offerFixtureActivations.length), 4)
    assert.equal(context.pages().length, originalPages, 'Offer activation opened a popup')
    assert.deepEqual(externalRequests, [], 'Offer fixture attempted an external request')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Offer fixture document overflows at ${width}`)
    await page.screenshot({ path: resolve(resultDir, `${width}-offer-actions.png`), fullPage: true })
  } finally {
    page.off('request', externalRequest)
    await context.unroute('**/*', blockExternal)
  }
}
