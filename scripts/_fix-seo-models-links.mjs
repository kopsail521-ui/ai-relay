import fs from 'fs'
const f = 'new-api/web/src/features/seo-pages/content.ts'
let s = fs.readFileSync(f, 'utf8')
s = s.replaceAll("href: '/models'", "href: '/pricing'")
fs.writeFileSync(f, s)
console.log('seo links updated')
