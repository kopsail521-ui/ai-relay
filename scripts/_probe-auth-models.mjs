import fs from 'fs'
const s = fs.readFileSync(process.env.TEMP + '/keyo-index.js', 'utf8')
// Find authenticated models route component hints near id:"/_authenticated/models/"
const markers = [
  '/_authenticated/models/',
  'features/pricing',
  'features/models',
  'Model Square',
  'Deployment',
]
for (const m of markers) console.log(m, s.includes(m), s.split(m).length - 1)

// search for createFileRoute models under auth context
let idx = s.indexOf('id:"/_authenticated/models/"')
console.log('\nauth models idx', idx)
if (idx >= 0) console.log(s.slice(idx, idx + 400))

// Look for Pricing component registration near models
idx = 0
let c = 0
while ((idx = s.indexOf('path:"/models/"', idx)) >= 0 && c < 4) {
  console.log('\npath models', c, s.slice(idx - 250, idx + 200))
  idx++
  c++
}
