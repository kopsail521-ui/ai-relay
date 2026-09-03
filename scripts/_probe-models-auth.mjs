import fs from 'fs'
const s = fs.readFileSync(process.env.TEMP + '/keyo-index.js', 'utf8')
const markers = [
  'path:"/models/"',
  "path:'/models/'",
  'id:"/models/"',
  '/models/',
  'sign-in',
  'HeaderNavModules',
]
for (const m of markers) {
  console.log(m, s.split(m).length - 1)
}
let idx = 0
let c = 0
while ((idx = s.indexOf('path:"/models/"', idx)) >= 0 && c < 2) {
  console.log('\n--- path models', c, '---')
  console.log(s.slice(Math.max(0, idx - 300), idx + 600))
  idx++
  c++
}
// find beforeLoad-like requireAuth check near models
idx = 0
c = 0
while ((idx = s.indexOf('requireAuth', idx)) >= 0 && c < 30) {
  const snip = s.slice(Math.max(0, idx - 80), idx + 120)
  if (snip.includes('sign-in') || snip.includes('models') || snip.includes('pricing')) {
    console.log('\n--- requireAuth ctx', c, '---')
    console.log(snip)
  }
  idx++
  c++
}
