import fs from 'fs'
import path from 'path'

function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue
      walk(p, a)
    } else if (/\.(tsx?|html|mjs)$/.test(e.name)) a.push(p)
  }
  return a
}

const files = [
  ...walk('new-api/web/src'),
  'static/brand/keyo-home.html',
]
for (const f of files) {
  let s
  try {
    s = fs.readFileSync(f, 'utf8')
  } catch {
    continue
  }
  const lines = s.split(/\n/)
  lines.forEach((l, i) => {
    if (/\/models|\/pricing/.test(l) && /(href|to:|navigate|Link|canonical|redirect)/i.test(l)) {
      console.log(`${f}:${i + 1}:${l.trim().slice(0, 180)}`)
    }
  })
}
