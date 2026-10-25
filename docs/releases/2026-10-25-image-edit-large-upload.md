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
