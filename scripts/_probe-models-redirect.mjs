import fs from 'fs'
const s = fs.readFileSync(process.env.TEMP + '/keyo-index.js', 'utf8')
const needle = 'to:"/models"'
console.log('count', s.split(needle).length - 1)
let idx = 0
let c = 0
while ((idx = s.indexOf(needle, idx)) >= 0 && c < 10) {
  console.log(c, s.slice(idx - 120, idx + 100))
  idx++
  c++
}
const n2 = 'redirect({to:"/models"'
console.log('redirect count', s.split(n2).length - 1)
