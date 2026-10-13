import fs from 'node:fs';

// Round-3 code block repairs on blog-inbox fragments (post-sync live damage).
// Same method as reformat-code-blocks.mjs: needle -> expand to <pre>…</pre> -> replace.

const replacements = {
  'blog-inbox/45717fli.html': [
    {
      needle: 'termination_reason = null for event in response_stream:',
      newCode: `<code class="language-text">buffer = &quot;&quot;
saw_terminal_event = false
termination_reason = null

for event in response_stream:
    if event contains text:
        buffer += event.text
        optionally_save_checkpoint(buffer)
    if event contains terminal metadata:
        saw_terminal_event = true
        termination_reason = event.termination_reason

if transport_failed:
    status = &quot;unknown&quot;
else if not saw_terminal_event:
    status = &quot;incomplete&quot;
else if termination_reason is not a normal completion:
    status = &quot;incomplete&quot;
else if not validate(buffer):
    status = &quot;incomplete&quot;
else:
    status = &quot;complete&quot;
</code>`,
    },
  ],

  'blog-inbox/7tw9n0ql.html': [
    {
      needle: 'generate(request): validate request select provider',
      newCode: `<code class="language-text">generate(request):
    validate request
    select provider and model
    apply timeout and retry policy
    send request
    normalize response
    record metrics
    return result
</code>`,
    },
    {
      needle: 'on request: estimate request cost if bucket has capacity:',
      newCode: `<code class="language-text">on request:
    estimate request cost
    if bucket has capacity:
        consume capacity
        send request
    else:
        queue or reject with a controlled response
</code>`,
    },
  ],

  'blog-inbox/cu1coapk.html': [
    {
      needle: 'Cached: Stable instructions Tool definitions',
      newCode: `<code class="language-text">Cached:
    Stable instructions
    Tool definitions
    Reference documentation

Dynamic:
    Conversation-specific user input
</code>`,
    },
  ],

  'blog-inbox/ur3fw22w.html': [
    {
      needle: 'Read catalog record -&gt; Open original image',
      newCode: `<code class="language-text">Read catalog record
  -&gt; Open original image
  -&gt; Validate file and product ID
  -&gt; Send multipart request with Bearer token
  -&gt; Check HTTP status and response body
  -&gt; Validate returned image
  -&gt; Store output
  -&gt; Update processing status
</code>`,
    },
  ],

  'blog-inbox/oyu8kdbq.html': [
    {
      needle: 'export KEYOAPI_API_KEY=&quot;YOUR_API_KEY&quot; curl --request POST',
      newCode: `<code class="language-bash">export KEYOAPI_API_KEY=&quot;YOUR_API_KEY&quot;
curl --request POST \\
  --url https://www.keyoapi.xyz/v1/images/mattings \\
  --header &quot;Authorization: Bearer \${KEYOAPI_API_KEY}&quot; \\
  --form &quot;model=RMBG-2.0&quot; \\
  --form &quot;image=@./product.jpg&quot;
</code>`,
    },
  ],
};

let total = 0;
for (const [file, items] of Object.entries(replacements)) {
  if (!fs.existsSync(file)) {
    console.error('MISSING FILE:', file);
    process.exit(1);
  }
  // normalize to LF first (git autocrlf re-checkout turns these CRLF)
  let html = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  for (const { needle, newCode } of items) {
    const idx = html.indexOf(needle);
    if (idx === -1) {
      console.error('NEEDLE NOT FOUND in', file, '->', needle.slice(0, 60));
      process.exit(1);
    }
    const second = html.indexOf(needle, idx + needle.length);
    if (second !== -1) {
      console.error('NEEDLE NOT UNIQUE in', file, '->', needle.slice(0, 60));
      process.exit(1);
    }
    const preStart = html.lastIndexOf('<pre', idx);
    const preEnd = html.indexOf('</pre>', idx + needle.length);
    if (preStart === -1 || preEnd === -1) {
      console.error('PRE BOUNDS NOT FOUND in', file, '->', needle.slice(0, 60));
      process.exit(1);
    }
    html =
      html.slice(0, preStart) +
      '<pre>' + newCode + '</pre>' +
      html.slice(preEnd + '</pre>'.length);
    total++;
  }
  fs.writeFileSync(file, html);
}

// separate exact-string fix: ur3fw22w missing space in --output flag
const f = 'blog-inbox/ur3fw22w.html';
let u = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const bad = '--output./product-shoe-removed.png';
if (u.includes(bad)) {
  u = u.split(bad).join('--output ./product-shoe-removed.png');
  fs.writeFileSync(f, u);
  total++;
  console.log('ur3fw22w: --output space fixed');
} else {
  console.log('ur3fw22w: --output pattern not found (check manually)');
}
console.log('Round-3 repairs applied:', total);