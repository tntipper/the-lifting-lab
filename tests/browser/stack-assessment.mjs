import assert from 'node:assert/strict'
import { resolve } from 'node:path'
const owner = '70000000-0000-4000-8000-000000000001'
const rows = [
  ['Legacy eligible', 'creatine', 80, 1], ['Claims held', 'zma', 99, 1],
  ['Zero placeholder', 'creatine', 0, 1], ['Unknown record', 'whey', null, 1],
  ['Unresolved legacy', 'creatine', 90, null],
].map(([name, category, score, servings], i) => ({
  id: `71000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, brand: 'Synthetic', name, category, score, servings,
  serving_size: 1, serving_unit: 'capsule', buy_url: 'https://shop.theliftinglab.co.uk/products/fixture?variant=123',
  product_nutrients: name === 'Claims held' ? [{ nutrient_name: 'Vitamin B6', amount: 20, unit: 'mg' }] : [],
}))
export async function verifyStackAssessment(page, origin, width, resultDir) {
  await page.evaluate(() => localStorage.clear())
  let mutations = 0, failAssessment = false
  const routeStack = async route => {
    if (route.request().method() !== 'GET') { mutations++; return route.abort() }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      userId: owner, stackId: '72000000-0000-4000-8000-000000000001', revision: 1, recoveryConflicts: 0,
      items: rows.map(p => ({ id: p.id, product_id: p.id, servings_per_day: p.servings, products: { ...p, score: 100 } })),
    }) })
  }
  await page.route('**/api/stack', routeStack)
  await page.route('**/api/products/batch?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows.map(p => ({ ...p, score: 100 }))) }))
  await page.route('**/api/stack/assessments?*', route => {
    if (failAssessment) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    const ids = new URL(route.request().url()).searchParams.get('ids').split(',')
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ products: rows.filter(p => ids.includes(p.id)) }) })
  })
  await page.goto(origin + '/stack-assessment')
  await page.getByText(/No approved product effectiveness assessment is available/).first().waitFor()
  const mainText = await page.locator('main').innerText()
  assert.match(mainText, /1 under review and 4 unassessed or unavailable excluded/)
  assert.match(mainText, /Serving amounts need review/)
  assert.match(mainText, /Unresolved legacy — amount unresolved/)
  assert.match(mainText, /Critical — Vitamin B6/)
  assert.match(mainText, /20mg total/)
  assert.match(mainText, /Not assessed/); assert.match(mainText, /Under review/)
  assert.doesNotMatch(mainText, /Average Effectiveness Match|Stack Score|Excellent|Good dosing/)
  await page.getByRole('button', { name: /Daily totals/i }).click()
  const totals = page.getByText('Daily Intake Totals', { exact: true }).locator('../..').locator('..')
  assert.match(await totals.innerText(), /20mg/)
  assert.match(await totals.innerText(), /\d+% RDA/)
  assert.match(await totals.innerText(), /\d+% UL/)
  assert.match(await totals.innerText(), /do not establish an effective or recommended dose/)
  assert.doesNotMatch(await totals.innerText(), /Hitting 100% RDA|RDA met|🎯/)
  const ul = totals.locator('span').filter({ hasText: /^\d+% UL$/ })
  assert.equal(await ul.evaluate(el => getComputedStyle(el).color), 'rgb(255, 92, 92)')
  const mail = page.locator('a[href^="mailto:"]')
  const email = new URL(await mail.getAttribute('href'))
  assert.match(email.searchParams.get('subject'), /Research Stack/)
  assert.match(email.searchParams.get('body'), /No approved product effectiveness assessment is available/)
  assert.match(email.searchParams.get('body'), /Under review; no benefit recommendation/)
  assert.match(email.searchParams.get('body'), /Not assessed/)
  assert.doesNotMatch(email.searchParams.get('body'), /scored 99|Excellent|Stack Score/)
  await page.getByRole('button', { name: /Share stack/i }).click()
  const x = new URL(await page.locator('a[href^="https://twitter.com/intent/"]').getAttribute('href'))
  assert.match(x.searchParams.get('text'), /0 of 5 products/)
  assert.match(x.searchParams.get('text'), /no benefit recommendation/)
  const cardUrl = new URL(await page.getByRole('link', { name: /Open share card image/ }).getAttribute('href'), origin)
  assert.deepEqual([...cardUrl.searchParams.keys()], ['ids'])
  // Opening the floating panel reads canonical IDs; it never uses the saved
  // score=100 fields. No clear/remove/save/publish action is performed.
  const trigger = page.getByRole('button', { name: 'My Stack', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'My Stack', exact: true })
  await dialog.getByText(/Under review/).first().waitFor()
  const text = await dialog.innerText()
  assert.match(text, /Under review/); assert.match(text, /Not assessed/)
  assert.doesNotMatch(text, /99\/100|100\/100|Excellent|Good dosing/)
  const closer = dialog.getByRole('button', { name: 'Close My Stack' })
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true) }
  await page.keyboard.press('Escape')
  assert.equal(await trigger.evaluate(el => el === document.activeElement), true)
  failAssessment = true
  await trigger.click()
  await dialog.getByText('Assessment unavailable').first().waitFor()
  assert.doesNotMatch(await dialog.innerText(), /99\/100|100\/100/)
  assert.equal(await closer.isEnabled(), true)
  await page.keyboard.press('Escape')
  assert.equal(mutations, 0)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Stack assessment overflows ${width}`)
  await page.screenshot({ path: resolve(resultDir, `${width}-stack-assessment.png`) })
  await page.unroute('**/api/stack', routeStack)
  await page.unroute('**/api/products/batch?*')
  await page.unroute('**/api/stack/assessments?*')
}
