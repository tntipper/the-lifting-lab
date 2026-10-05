import assert from 'node:assert/strict'
import { resolve } from 'node:path'

export async function verifyRankings(page, origin, width, resultDir) {
  await page.route('**/api/favourites', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ids":[]}' }))
  await page.route('**/api/products/reviews-summary', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  for (const pathname of ['/rankings', '/unassessed']) {
    await page.goto(origin + pathname)
    await page.getByRole('combobox', { name: 'Sort products' }).waitFor()
    const cards = page.locator('[data-product-id]')
    assert.equal(await cards.count(), pathname === '/rankings' ? 5 : 3)
    for (const sort of ['score', 'name', 'brand', 'value', 'budget', 'score']) {
      await page.getByRole('combobox', { name: 'Sort products' }).selectOption(sort)
      for (const id of ['unknown', 'zero', 'held']) {
        const card = page.locator(`[data-product-id="${id}"]`)
        const text = await card.innerText()
        assert.match(text, id === 'held' ? /Under review/ : /Not assessed/)
        assert.doesNotMatch(text, /🥇|🥈|🥉|Top Pick|Best Value Pick|Best Budget Pick|Good dosing|Excellent dosing|ATP resynthesis/)
        assert.equal(await card.getByText('Shop offer under review', { exact: false }).count(), 1)
        assert.equal(await card.locator('a[href*="shop.theliftinglab"]').count(), 0)
        const box = await card.boundingBox()
        assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, `Research card overflows at ${width}`)
      }
      const body = await page.locator('main').innerText()
      assert.doesNotMatch(body, /🥇|🥈|🥉|Top Pick|Best Value Pick|Best Budget Pick|Excellent dosing|Good dosing/)
      if (pathname === '/rankings') {
        for (const id of ['legacy-high', 'legacy-value']) {
          const legacy = page.locator(`[data-product-id="${id}"]`)
          assert.match(await legacy.innerText(), /Not assessed/); assert.doesNotMatch(await legacy.innerText(), /80\/100|60\/100|80%|60%/)
          assert.equal(await legacy.locator('[data-assessment="legacy"]').count(), 1)
        }
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Rankings overflow ${width}/${sort}`)
    }
    await page.screenshot({ path: resolve(resultDir, `${width}-${pathname.slice(1)}.png`) })
  }
  await page.unroute('**/api/favourites')
  await page.unroute('**/api/products/reviews-summary')
}
