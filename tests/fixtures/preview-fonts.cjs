// Next's documented-in-source font test hook: use its bundled local font.
const font = require.resolve('next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf')
module.exports = new Proxy({}, { get(_target, url) {
  if (typeof url !== 'string' || !url.startsWith('https://fonts.googleapis.com/')) return undefined
  const family = new URL(url).searchParams.get('family').split(':')[0]
  return `/* latin */\n@font-face {\n font-family: '${family}';\n font-style: normal;\n font-weight: 100 900;\n src: url(${font}) format('truetype');\n}`
} })
