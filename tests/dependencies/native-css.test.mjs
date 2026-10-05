import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postcss from 'postcss'
import sharp from 'sharp'
import { customAlphabet } from 'nanoid'
import { nanoid } from 'nanoid/non-secure'

test('patched native image stack preserves benign decoding and resizing', async () => {
  assert.equal(sharp.versions.sharp, '0.35.4')
  assert.equal(sharp.versions.heif, '1.23.2')
  for (const format of ['png', 'jpeg', 'webp', 'avif', 'gif', 'tiff']) {
    const image = await sharp({create:{width:32,height:24,channels:3,background:'#a6e22e'}}).toFormat(format).toBuffer()
    const resized = await sharp(image).resize(16).webp().toBuffer()
    const metadata = await sharp(resized).metadata()
    assert.equal(metadata.width,16,format)
    assert.equal(metadata.height,12,format)
    assert.equal(metadata.format,'webp',format)
  }
})
test('PostCSS keeps valid CSS and source maps usable', async () => {
  const result = await postcss([]).process('a { color: red; }', {from:'/synthetic/input.css',to:'/synthetic/output.css',map:{inline:false}})
  assert.equal(result.css.split('\n')[0], 'a { color: red; }')
  const map = result.map.toJSON()
  assert.ok(map.sources.includes('input.css'))
  assert.deepEqual(map.sourcesContent,['a { color: red; }'])
})
test('untrusted CSS cannot import an arbitrary fixture map with or without from', async () => {
  const root=await mkdtemp(join(tmpdir(),'tll-postcss-fixture-'))
  try {
    const marker='SYNTHETIC_PRIVATE_SOURCE_MARKER'
    const file=join(root,'private.map')
    await writeFile(file,JSON.stringify({version:3,file:'private.css',sources:['private.css'],sourcesContent:[marker],names:[],mappings:'AAAA'}))
    for(const from of [undefined, join(root,'nested','input.css')]) {
      const css=`a{color:red}/*# sourceMappingURL=${from?'../private.map':file} */`
      const result=await postcss([]).process(css,{from,to:join(root,'output.css'),map:{inline:false}})
      assert.ok(!JSON.stringify(result.map.toJSON()).includes(marker))
    }
  } finally {await rm(root,{recursive:true,force:true})}
})
test('Nanoid invalid sizes terminate safely', () => {
  assert.equal(nanoid(-1), '')
  assert.equal(customAlphabet('abc',0)(), '')
  assert.equal(nanoid(6).length,6)
})
