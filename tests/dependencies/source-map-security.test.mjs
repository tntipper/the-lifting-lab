import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// Resolve the actual production Next → PostCSS dependency, not a dev-only copy.
const require = createRequire(import.meta.url)
const nextRequire = createRequire(require.resolve('next/package.json'))
const postcssRequire = createRequire(nextRequire.resolve('postcss/package.json'))
const { SourceMapConsumer, SourceMapGenerator } = postcssRequire('source-map-js')
const flat = () => ({ version: 3, sources: ['synthetic.css'], names: [], mappings: 'AAAA' })
const indexed = (line, map = flat()) => ({
  version: 3, sections: [{ offset: { line, column: 0 }, map }],
})

test('production source-map consumer rejects an amplifying indexed offset before serialization', () => {
  // Construction alone is safe on the old version; never serialize its huge gap.
  assert.throws(() => new SourceMapConsumer(indexed(Number.MAX_SAFE_INTEGER)), /offset/i)
})

test('production source-map consumer bounds the sum of nested section offsets', () => {
  assert.throws(() => new SourceMapConsumer(indexed(6_000_000, indexed(6_000_000))), /offset/i)
})

test('production source-map consumer preserves ordinary indexed mapping round trips', () => {
  const consumer = new SourceMapConsumer(indexed(3))
  const generator = new SourceMapGenerator()
  consumer.eachMapping(mapping => generator.addMapping({
    generated: { line: mapping.generatedLine, column: mapping.generatedColumn },
    original: { line: mapping.originalLine, column: mapping.originalColumn },
    source: mapping.source,
  }))
  const generated = generator.toJSON()
  const roundTrip = new SourceMapConsumer(generated)
  assert.deepEqual(roundTrip.originalPositionFor({ line: 4, column: 0 }), {
    source: 'synthetic.css', line: 1, column: 0, name: null,
  })
})
