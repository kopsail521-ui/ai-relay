# Reference image uploads fail above approximately 1 MiB

Some clients add `Expect: 100-continue` when uploading larger multipart bodies.
The gateway buffered and normalized the body, but forwarded the original
connection headers to Node's fetch. Undici rejects `Expect`, producing
`502 image_forwarding_failed` before the image service receives a submission.
This explains why single or combined reference file size changed the outcome
independently of model or pixel dimensions.

The same header sanitation now covers native image/video forwarding and the
compatibility proxy: remove the completed client handshake, original framing,
and hop headers (including fields named by `Connection`); let fetch generate
the new content length. Authorization and Idempotency-Key remain intact. No
automatic retry or alternate generation submission was introduced.

## Evidence

The read-only production diagnostic
[40160873918](https://github.com/kopsail521-ui/ai-relay/actions/runs/40160873918)
matched `7483a038-b182-48ef-aec5-05e417d04356` and
`cb74ff66-f816-4449-8f43-fa5b51b37510` to
`TypeError / UND_ERR_NOT_SUPPORTED`. The first supplied ID was absent from the
bounded retained-log sample; absence does not establish its cause.

The new local HTTP regression initially reproduced the exact 502 on the old
code. After the fix, six scenarios pass: a 1.2 MiB reference, two 700 KiB
references, a 5 MiB reference, chunked upload, JSON/base64 with Expect, and
legacy multipart with Expect. Native requests return the mocked 202, preserve
each reference byte and async parameter, and forward exactly once. Legacy
requests retain their original multipart body. Credentials, idempotency and
ordinary end-to-end headers survive; client framing and connection fields do
not. Existing moderation denial, transport failure and no-fallback checks pass.

The isolated gateway/native/wallet fixture also passes, including replay,
polling outage, policy rejection, timeout and once-only billing. Auth proxy,
28 video contract and task response checks pass. The dedicated diagnostic's
six sanitizer/command-boundary tests pass without Docker or network access.

## Scope

No real models, customer keys or generation requests were used. Local 202s are
mock service acceptance, not proof of live image output quality. Existing file,
multipart and normalized JSON limits still apply; base64 expands binary input
by approximately one third. This change removes the accidental approximately
1 MiB transport failure and does not promise unbounded uploads.

Pushing the proxy change to main runs the existing offline release checks,
safe proxy deployment, source/PID ownership verification and public GET checks.

## Production acceptance

Fix `0584893` was automatically deployed by
[40160965317](https://github.com/kopsail521-ui/ai-relay/actions/runs/40160965317)
at 12:12 on 2026-10-25 (Asia/Shanghai). The 24 deployment regression checks,
HTTP integration and other offline release checks passed. Deployment verified
four source files and stable process ownership twice (`PID=897513`), followed
by `PUBLIC_PROXY_RELEASE_OK` without model calls.

A second read-only diagnostic
[40161059629](https://github.com/kopsail521-ui/ai-relay/actions/runs/40161059629)
confirmed that the live container was running without restarting and that
`/app/server.mjs` exactly matched the committed fix's SHA-256:
`4e8f9e1ba68c9e3b6da9566613c05ba4a7f1ff1e4074efe763ae19fa5edb62e4`.
No paid production generation was submitted for acceptance.

## Follow-up: references in the tens of megabytes

The repeated report supplied the same three request IDs. Two retained records
date from before the first release; they do not identify a new failure after
deployment. A subsequent read-only diagnostic
[40162224632](https://github.com/kopsail521-ui/ai-relay/actions/runs/40162224632)
confirmed the fixed proxy source, no restart/OOM state for the current proxy or
native service, and no forwarding-failure markers in the current proxy's bounded
log window. This does not establish the outcome of an unobserved customer request.

Additional isolated testing found two independent defects:

- GPT `size`/`resolution` aliases such as `1K`, `2K` and `4K` reassigned a `const`
  binding, causing a runtime error before validation. The binding is now mutable;
  supported aliases normalize correctly and unsupported model sizes still return
  400. Reference image dimensions do not select output resolution.
- A native JSON body exceeding 32 MiB destroyed its incoming socket when leaving
  the default request iterator. The complete proxy/native fixture reproduced
  `502 image_forwarding_failed` for two 13 MiB inline references after base64
  expansion. Known-length and chunked bodies now return the intended
  `413 image_body_too_large` without creating a task, reserving funds or submitting
  to a provider. The iterator leaves the socket writable and drains rejected input.

The expanded complete-chain fixture accepts individual 15 MiB and 20 MiB binary
multipart references. It checks the exact forwarded SHA-256, mocked completion,
task polling, equivalent JSON replay, one provider submission and one charge in
the isolated SQLite fixture. Over-limit JSON and large multipart text fields
remain explicit 413s even on retry, with no task or balance change. These are
synthetic byte fixtures with a local mock provider, not actual 4K image generation.

Existing limits remain: 20 MiB per multipart image, 32 MiB total multipart body,
64 KiB per multipart text field, and 32 MiB after normalization to JSON. Base64
expands bytes by approximately 4/3, so the combined inline binary budget is less
than 24 MiB once JSON and other fields are included. Large base64 belongs in JSON;
local image uploads should be file parts with a filename, not multipart text.
HTTP(S) image URLs avoid inline file expansion but must be retrievable by the
image service. No image compression or model substitution was introduced.

Validation: all 43 native image tests, the complete proxy/native/wallet fixture,
10 new native deployment checks and 30 reused deployment helper checks pass.
The older clipboard packager's separate pre-existing packaging failure is outside
the new deployment path. The new image-only workflow preserves runtime settings,
persistent mounts and retained backups; it builds before replacing the native
container, verifies seven source hashes and stable listener ownership twice,
and rolls back only that service on a failed check. Public acceptance uses GET
metadata requests. No real model or customer key is used.
