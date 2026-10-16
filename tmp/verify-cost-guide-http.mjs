import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const routes=[['/claude-code-api-pricing','static/seo/claude-code-api-pricing.html'],['/model/cloudflare-clef','static/seo/model/cloudflare-clef.html'],['/pricing-list','static/seo/pricing.html'],['/claude-api-pricing','static/seo/claude-api-pricing.html'],['/ai-agent-api','static/seo/ai-agent-api.html'],['/models','static/seo/models.html'],['/compare','static/seo/compare.html'],['/brand/keyo-api-ref.html','static/brand/keyo-api-ref.html'],['/sitemap.xml','static/seo/sitemap.xml'],['/robots.txt','static/seo/robots.txt']];
for(const [url,file]of routes){const response=await fetch('http://127.0.0.1:8873'+url,{signal:AbortSignal.timeout(3000)});assert.equal(response.status,200,url);assert.equal(await response.text(),fs.readFileSync(path.join(root,file),'utf8'),url+' differs from generated file');console.log('200, exact artifact match: '+url);}
console.log('PASS: local HTTP serves all ten reviewed artifacts exactly.');
