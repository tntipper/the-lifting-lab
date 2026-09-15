import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
const sharp = nextRequire("sharp");

test("the patched Next image dependency decodes and resizes standard storefront formats", async t => {
  const source = await sharp({ create: { width: 16, height: 12, channels: 4, background: { r: 80, g: 160, b: 60, alpha: 1 } } }).png().toBuffer();
  for (const format of ["png", "jpeg", "webp"]) {
    await t.test(format, async () => {
      const output = await sharp(source).resize({ width: 8, height: 6 }).toFormat(format).toBuffer();
      const metadata = await sharp(output).metadata();
      assert.equal(metadata.width, 8);
      assert.equal(metadata.height, 6);
      assert.equal(metadata.format, format);
    });
  }
});
