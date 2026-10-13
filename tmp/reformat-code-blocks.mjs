import fs from 'node:fs';

// Reformat compressed <pre> code blocks in blog-inbox fragments and clean
// article bodies. Each entry: file -> array of { needle, newCode } where
// needle is a unique substring of the compressed block and newCode is the
// full replacement <code>…</code> inner content (kept as-is, verbatim).

const replacements = {
  'blog-inbox/1gger7hd.html': [
    {
      needle: 'from dataclasses import dataclass',
      newCode: `<code class="language-python">from dataclasses import dataclass
from typing import Literal

@dataclass
class TicketClassification:
    category: Literal[&quot;billing&quot;, &quot;technical&quot;, &quot;account&quot;, &quot;other&quot;]
    urgency: Literal[&quot;low&quot;, &quot;medium&quot;, &quot;high&quot;]
    summary: str
    requires_human_review: bool
</code>`,
    },
    {
      needle: 'from pydantic import BaseModel, Field, field_validator class',
      newCode: `<code class="language-python">from typing import Literal
from pydantic import BaseModel, Field, field_validator

class TicketClassification(BaseModel):
    category: Literal[&quot;billing&quot;, &quot;technical&quot;, &quot;account&quot;, &quot;other&quot;]
    urgency: Literal[&quot;low&quot;, &quot;medium&quot;, &quot;high&quot;]
    summary: str = Field(min_length=1, max_length=280)
    requires_human_review: bool

    @field_validator(&quot;summary&quot;)
    @classmethod
    def reject_control_characters(cls, value: str) -&gt; str:
        if any(ord(char) &lt; 32 and char not in &quot;\\n\\t&quot; for char in value):
            raise ValueError(&quot;summary contains unsupported control characters&quot;)
        return value.strip()
</code>`,
    },
    {
      needle: 'classification = TicketClassification.model_validate(parsed_json)',
      newCode: `<code class="language-python">classification = TicketClassification.model_validate(parsed_json)
if classification.requires_human_review:
    queue_for_review(classification)
else:
    route_ticket(classification)
</code>`,
    },
    {
      needle: 'import json def parse_json_object',
      newCode: `<code class="language-python">import json

def parse_json_object(text: str) -&gt; dict:
    value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError(&quot;Expected a JSON object&quot;)
    return value
</code>`,
    },
    {
      needle: 'def validate_schema(data: dict)',
      newCode: `<code class="language-python">def validate_schema(data: dict) -&gt; TicketClassification:
    return TicketClassification.model_validate(data)
</code>`,
    },
    {
      needle: 'def validate_business_rules(result: TicketClassification)',
      newCode: `<code class="language-python">def validate_business_rules(result: TicketClassification) -&gt; None:
    if result.urgency == &quot;high&quot; and not result.requires_human_review:
        raise ValueError(&quot;High-urgency tickets require human review&quot;)
</code>`,
    },
    {
      needle: 'attempt = 0 while attempt &lt; maximum_attempts',
      newCode: `<code class="language-text">attempt = 0
while attempt &lt; maximum_attempts:
    response = call_model()
    if response is a transient transport or service failure:
        wait using exponential backoff with jitter
        attempt += 1
        continue
    text = extract_model_text(response)
    try:
        parsed = parse_json(text)
        result = validate_schema(parsed)
        validate_business_rules(result)
        return result
    except ValidationError as error:
        if attempt has no remaining repair attempts:
            send_to_fallback_workflow(error)
            stop
        call_model_again_with:
            - the original task
            - the required output contract
            - a short explanation of the validation failure
            - no private logs, secrets, or unrelated customer data
        attempt += 1
</code>`,
    },
  ],

  'blog-inbox/1y1kuuoj.html': [
    {
      needle: 'for attempt from 1 to max_attempts:',
      newCode: `<code class="language-text">for attempt from 1 to max_attempts:
    response = send_request()
    if response is successful:
        return response
    if response is not a retryable rate-limit error:
        return handle_error(response)
    if attempt == max_attempts or deadline_would_be_exceeded():
        return report_retry_exhausted(response)
    delay = documented_retry_delay(response) or exponential_backoff_with_jitter(attempt)
    sleep(min(delay, remaining_deadline))
</code>`,
    },
  ],

  'blog-inbox/2o2w88ar.html': [
    {
      needle: 'POST /avatar-videos',
      newCode: `<code class="language-text">POST /avatar-videos
→ 202 Accepted
{
    &quot;job_id&quot;: &quot;job_123&quot;,
    &quot;status&quot;: &quot;queued&quot;
}
</code>`,
    },
    {
      needle: 'Client │ ▼',
      newCode: `<code class="language-text">Client
  │
  ▼
Your API
  ├── Validate request
  ├── Authenticate caller
  ├── Create idempotent job
  └── Publish queue message
  │
  ▼
Worker
  ├── Submit generation request
  ├── Store provider job ID
  ├── Poll or receive webhook
  ├── Download result
  └── Update job state
  │
  ▼
Database + Object Storage
  │
  ▼
Client webhook/status API
</code>`,
    },
    {
      needle: 'created_at&quot;: &quot;2025-01-01T12:00:00Z&quot;',
      newCode: `<code class="language-json">{
    &quot;job_id&quot;: &quot;job_123&quot;,
    &quot;status&quot;: &quot;queued&quot;,
    &quot;created_at&quot;: &quot;2025-01-01T12:00:00Z&quot;,
    &quot;status_url&quot;: &quot;/avatar-videos/job_123&quot;
}
</code>`,
    },
  ],

  'blog-inbox/62c44nq0.html': [
    {
      needle: 'application request | v',
      newCode: `<code class="language-text">application request
  |
  v
bounded work queue
  |
  v
worker pool with concurrency limit
  |
  v
provider request
  +--&gt; success
  +--&gt; transient error --&gt; delayed retry
  +--&gt; permanent error --&gt; fail and report
</code>`,
    },
    {
      needle: 'function process(job): deadline = now + job.maximum_duration',
      newCode: `<code class="language-text">function process(job):
    deadline = now + job.maximum_duration
    attempt = 0
    while now &lt; deadline and attempt &lt; job.maximum_attempts:
        response = send_request(job)
        if response.success:
            return response.result
        classification = classify(response)
        if classification == permanent_failure:
            record_failure(job, response)
            return failure
        if classification == quota_or_balance_failure:
            alert_and_stop(job, response)
            return failure
        delay = retry_after(response)
        if delay is missing:
            delay = exponential_backoff_with_jitter(attempt)
        if now + delay &gt;= deadline:
            break
        sleep(delay)
        attempt += 1
    move_to_dead_letter_or_retry_queue(job)
    return failure
</code>`,
    },
    {
      needle: 'if rate_limit_rate increases: reduce concurrency',
      newCode: `<code class="language-text">if rate_limit_rate increases:
    reduce concurrency
    increase admission delay
elif queue latency is high and rate_limit_rate is low:
    increase concurrency gradually
</code>`,
    },
    {
      needle: 'generate_text( model, messages, timeout, request_id',
      newCode: `<code class="language-text">generate_text(
    model,
    messages,
    timeout,
    request_id
) -&gt; result
</code>`,
    },
  ],

  'blog-inbox/axc6qmip.html': [
    {
      needle: 'token_budget_per_second = TPM / 60 estimated_token_rate',
      newCode: `<code class="language-text">request_budget_per_second = RPM / 60
token_budget_per_second = TPM / 60

estimated_token_rate = request_budget_per_second * average_tokens_per_request
estimated_request_rate = token_budget_per_second / average_tokens_per_request
safe_request_rate = min(request_budget_per_second, estimated_request_rate)
</code>`,
    },
    {
      needle: 'for attempt in 1..maximum_attempts:',
      newCode: `<code class="language-text">for attempt in 1..maximum_attempts:
    result = send_request()
    if result succeeded:
        return result
    if result is throttled or transient:
        wait using bounded exponential backoff with jitter
        continue
    fail without retrying
return a retryable failure to the caller or queue
</code>`,
    },
  ],

  'blog-inbox/dxp8cdop.html': [
    {
      needle: 'def create_avatar_job(user, request):',
      newCode: `<code class="language-python">def create_avatar_job(user, request):
    validate_request(request)
    enforce_user_limits(user)
    job = store.create_job(
        user_id=user.id,
        status=&quot;queued&quot;,
        request_summary=safe_summary(request),
    )
    queue.enqueue(&quot;submit_avatar_job&quot;, job.id)
    return {&quot;job_id&quot;: job.id, &quot;status&quot;: job.status}

def submit_avatar_job(job_id):
    job = store.get_job(job_id)
    try:
        result = provider.submit_job(
            validated_payload=load_payload(job_id),
            idempotency_key=job.id,
        )
    except ProviderError as error:
        handle_submission_error(job, error)
        return
    store.update_job(
        job_id,
        status=&quot;submitted&quot;,
        provider_job_id=result.job_id,
    )
    queue.enqueue(&quot;poll_avatar_job&quot;, job_id, delay_seconds=2)

def poll_avatar_job(job_id):
    job = store.get_job(job_id)
    try:
        result = provider.get_job(job.provider_job_id)
    except ProviderError as error:
        handle_poll_error(job, error)
        return
    if result.status in documented_success_states():
        store.mark_succeeded(job_id, result_reference=result.output)
    elif result.status in documented_failure_states():
        store.mark_failed(job_id, safe_error(result))
    else:
        queue.enqueue(
            &quot;poll_avatar_job&quot;,
            job_id,
            delay_seconds=next_poll_delay(job.poll_attempts),
        )
</code>`,
    },
  ],

  'blog-inbox/jnv30sj3.html': [
    {
      needle: 'client = OpenAI( base_url=&quot;https://www.keyoapi.xyz/v1&quot; api_key=&quot;YOUR_API_KEY&quot;',
      newCode: `<code class="language-python">from openai import OpenAI

client = OpenAI(
    base_url=&quot;https://www.keyoapi.xyz/v1&quot;,
    api_key=&quot;YOUR_API_KEY&quot;,
)
</code>`,
    },
    {
      needle: 'client = OpenAI( base_url=&quot;https://www.keyoapi.xyz/v1&quot; api_key=os.environ',
      newCode: `<code class="language-python">import os
from openai import OpenAI

client = OpenAI(
    base_url=&quot;https://www.keyoapi.xyz/v1&quot;,
    api_key=os.environ[&quot;KEYO_API_KEY&quot;],
)
</code>`,
    },
    {
      needle: 'for attempt in 1 through maximum_attempts:',
      newCode: `<code class="language-text">for attempt in 1 through maximum_attempts:
    send request
    if success:
        return response
    if error is not retryable:
        fail immediately
    wait using exponential backoff plus jitter
</code>`,
    },
  ],

  'blog-inbox/ooy10bjn.html': [
    {
      needle: 'maximum_delay = 30 seconds exponential_delay',
      newCode: `<code class="language-text">base_delay = 1 second
maximum_delay = 30 seconds

exponential_delay = min(maximum_delay, base_delay * 2^(attempt - 1))
random_delay = a random value between 0 and exponential_delay
</code>`,
    },
    {
      needle: 'function call_model(request, deadline):',
      newCode: `<code class="language-text">function call_model(request, deadline):
    for attempt in 1.MAX_ATTEMPTS:
        response = send_request(request, timeout=remaining(deadline))
        if response succeeded:
            return response
        category = classify_error(response)
        if category is authentication_error:
            raise permanent_error(&quot;Check credentials&quot;)
        if category is invalid_request:
            raise permanent_error(&quot;Fix request parameters&quot;)
        if category is model_unavailable:
            raise permanent_error(&quot;Select a model from the live model catalog&quot;)
        if category is quota_exhausted:
            raise non_retryable_error(&quot;Check usage limits or account balance&quot;)
        if category is temporary_rate_limit or timeout or upstream_unavailable:
            if attempt == MAX_ATTEMPTS:
                raise retry_exhausted(response)
            server_delay = extract_retry_delay(response)
            delay = choose_bounded_delay(server_delay, attempt)
            sleep(delay)
            continue
        raise unexpected_error(response)
</code>`,
    },
    {
      needle: 'generate( messages, logical_model, timeout, metadata',
      newCode: `<code class="language-text">generate(
    messages,
    logical_model,
    timeout,
    metadata
) -&gt; generated_response
</code>`,
    },
  ],

  'blog-inbox/qbfzdawk.html': [
    {
      needle: 'if API_KEY is missing or empty: fail with &quot;API key is not configured&quot;',
      newCode: `<code class="language-text">if API_KEY is missing or empty:
    fail with &quot;API key is not configured&quot;
</code>`,
    },
    {
      needle: 'send request if response is 401:',
      newCode: `<code class="language-text">send request
if response is 401:
    record sanitized authentication error
    do not retry
    alert or fail the operation
else if response is 429 or a transient 5xx:
    retry up to a small configured limit
    wait with exponential backoff and jitter
else:
    handle according to the response status
</code>`,
    },
  ],

  'blog-inbox/vv4t8krr.html': [
    {
      needle: 'for attempt from 0 through max_retries:',
      newCode: `<code class="language-text">for attempt from 0 through max_retries:
    response = send_request()
    if response succeeded:
        return response
    if response is a permanent error:
        fail immediately
    if response is transient:
        if attempt == max_retries:
            fail and record the exhausted retry
        delay = server_retry_hint_or_exponential_backoff(attempt)
        sleep(delay)
raise retry_exhausted_error
</code>`,
    },
  ],

  // ---- 5 clean articles (bodies under tmp/geo-bodies-clean) ----
  'tmp/geo-bodies-clean/ncx234u2.html': [
    {
      needle: 'function call_with_retry(request):',
      newCode: `<code class="language-text">function call_with_retry(request):
    deadline = current_time + 30 seconds
    for attempt from 0 through 4:
        try:
            response = send(request, timeout=10 seconds)
            if response.status is successful:
                return response
            if response.status is not retryable:
                raise NonRetryableError(response)
            if current_time &gt;= deadline:
                raise RetryBudgetExceeded(response)
            delay = min(16 seconds, 1 second * 2^attempt)
            sleep(random_between(0, delay))
        catch network_error or timeout:
            if current_time &gt;= deadline:
                raise RetryBudgetExceeded()
            delay = min(16 seconds, 1 second * 2^attempt)
            sleep(random_between(0, delay))
    raise RetryBudgetExceeded()
</code>`,
    },
    {
      needle: 'generate_answer(input, policy):',
      newCode: `<code class="language-text">generate_answer(input, policy):
    primary_result = call_claude_with_retry(input)
    if primary_result succeeds:
        return normalize(primary_result, provider=&quot;claude&quot;)
    if failure is eligible for fallback:
        fallback_result = call_fallback_with_retry(input)
        return normalize(fallback_result, provider=&quot;fallback&quot;)
    raise primary_result.error
</code>`,
    },
    {
      needle: 'InternalRequest: input_messages',
      newCode: `<code class="language-text">InternalRequest:
    input_messages
    temperature
    max_output_tokens
    tools
    response_format
    deadline
InternalResponse:
    text
    tool_calls
    finish_reason
    usage
    provider
    model
    request_id
</code>`,
    },
    {
      needle: 'if provider == &quot;claude&quot;:.',
      newCode: `<code class="language-text">if provider == &quot;claude&quot;:
    ...
else if provider == &quot;fallback&quot;:
    ...
</code>`,
    },
  ],

  'tmp/geo-bodies-clean/lfmh7jgs.html': [
    {
      needle: 'User request | v',
      newCode: `<code class="language-text">User request
  |
  v
Script preparation
  |
  v
Voice generation
  |
  v
Avatar and lip-sync rendering
  |
  v
Video validation
  |
  v
Object storage and delivery
</code>`,
    },
    {
      needle: 'create_avatar_video( script, avatar, voice, output_settings',
      newCode: `<code class="language-text">create_avatar_video(
    script,
    avatar,
    voice,
    output_settings
)
</code>`,
    },
    {
      needle: '&quot;job_id&quot;: &quot;local-job-id&quot;',
      newCode: `<code class="language-text">{
    &quot;job_id&quot;: &quot;local-job-id&quot;,
    &quot;status&quot;: &quot;completed&quot;,
    &quot;video_url&quot;: &quot;temporary-or-signed-url&quot;,
    &quot;duration_seconds&quot;: 42.7,
    &quot;width&quot;: 1920,
    &quot;height&quot;: 1080,
    &quot;format&quot;: &quot;mp4&quot;,
    &quot;expires_at&quot;: &quot;timestamp&quot;
}
</code>`,
    },
  ],

  'tmp/geo-bodies-clean/c896hb32.html': [
    {
      needle: 'class AvatarProvider {',
      newCode: `<code class="language-js">class AvatarProvider {
  async uploadAsset(file) {
    throw new Error(&quot;Implement with the provider's documented upload API&quot;);
  }
  async createJob(input) {
    throw new Error(&quot;Implement with the provider's documented job API&quot;);
  }
  async getJob(jobId) {
    throw new Error(&quot;Implement with the provider's documented status API&quot;);
  }
  async downloadResult(job) {
    throw new Error(&quot;Implement with the provider's documented result API&quot;);
  }
}
</code>`,
    },
    {
      needle: 'const sleep = (ms) =&gt; new Promise',
      newCode: `<code class="language-js">const sleep = (ms) =&gt; new Promise((resolve) =&gt; setTimeout(resolve, ms));

function isRetryableError(error) {
  return (
    error?.retryable === true ||
    error?.status === 408 ||
    error?.status === 429 ||
    error?.status &gt;= 500
  );
}

async function withExponentialBackoff(
  operation,
  {
    attempts = 4,
    baseDelayMs = 500,
    maxDelayMs = 10_000,
    shouldRetry = isRetryableError,
  } = {},
) {
  let lastError;
  for (let attempt = 0; attempt &lt; attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !shouldRetry(error)) {
        throw error;
      }
      const exponentialDelay = Math.min(
        maxDelayMs,
        baseDelayMs * 2 ** attempt,
      );
      const jitter = Math.floor(Math.random() * 250);
      await sleep(exponentialDelay + jitter);
    }
  }
  throw lastError;
}

async function renderAvatar({
  provider,
  sourceImage,
  speechAudio,
  script,
  idempotencyKey,
  pollIntervalMs = 2_000,
  maxPolls = 90,
}) {
  const image = await withExponentialBackoff(
    () =&gt; provider.uploadAsset(sourceImage),
  );
  const audio = await withExponentialBackoff(
    () =&gt; provider.uploadAsset(speechAudio),
  );
  const job = await withExponentialBackoff(
    () =&gt;
      provider.createJob({
        imageAssetId: image.id,
        audioAssetId: audio.id,
        script,
        idempotencyKey,
      }),
  );
  for (let poll = 0; poll &lt; maxPolls; poll += 1) {
    const currentJob = await withExponentialBackoff(
      () =&gt; provider.getJob(job.id),
    );
    if (currentJob.status === &quot;completed&quot;) {
      return provider.downloadResult(currentJob);
    }
    if (currentJob.status === &quot;failed&quot; || currentJob.status === &quot;cancelled&quot;) {
      const error = new Error(
        currentJob.error?.message || \`Avatar job \${currentJob.status}\`,
      );
      error.retryable = false;
      throw error;
    }
    await sleep(pollIntervalMs);
  }
  const timeout = new Error(&quot;Avatar job did not finish before the polling limit&quot;);
  timeout.retryable = false;
  throw timeout;
}
</code>`,
    },
    {
      needle: 'id: &quot;provider-job-id&quot;, status: &quot;queued&quot;',
      newCode: `<code class="language-js">{
  id: &quot;provider-job-id&quot;,
  status: &quot;queued&quot; | &quot;processing&quot; | &quot;completed&quot; | &quot;failed&quot; | &quot;cancelled&quot;,
  error: {
    message: &quot;optional provider error&quot;,
  },
}
</code>`,
    },
    {
      needle: 'function normalizeJob(providerJob) {',
      newCode: `<code class="language-js">function normalizeJob(providerJob) {
  return {
    id: providerJob.id,
    status: mapProviderStatus(providerJob.status),
    progress: providerJob.progress ?? null,
    error: providerJob.error
      ? {
          code: providerJob.error.code,
          message: providerJob.error.message,
        }
      : null,
  };
}
</code>`,
    },
    {
      needle: 'const apiKey = process.env.KEYO_API_KEY;',
      newCode: `<code class="language-js">const apiKey = process.env.KEYO_API_KEY;
if (!apiKey) {
  throw new Error(&quot;KEYO_API_KEY is required&quot;);
}
</code>`,
    },
    {
      needle: 'import crypto from &quot;node:crypto&quot;;',
      newCode: `<code class="language-js">import crypto from &quot;node:crypto&quot;;

function createIdempotencyKey(renderRequestId) {
  return crypto
    .createHash(&quot;sha256&quot;)
    .update(\`avatar-render:\${renderRequestId}\`)
    .digest(&quot;hex&quot;);
}
</code>`,
    },
    {
      needle: 'function toApplicationError(error) {',
      newCode: `<code class="language-js">function toApplicationError(error) {
  if (error.status === 429) {
    return {
      code: &quot;RATE_LIMITED&quot;,
      retryable: true,
      message: &quot;The rendering service is temporarily rate-limited.&quot;,
    };
  }
  if (error.status &gt;= 500) {
    return {
      code: &quot;UPSTREAM_UNAVAILABLE&quot;,
      retryable: true,
      message: &quot;The rendering service is temporarily unavailable.&quot;,
    };
  }
  return {
    code: &quot;AVATAR_REQUEST_FAILED&quot;,
    retryable: false,
    message: &quot;The avatar request could not be completed.&quot;,
  };
}
</code>`,
    },
    {
      needle: 'function createFakeProvider() {',
      newCode: `<code class="language-js">function createFakeProvider() {
  let polls = 0;
  return {
    async uploadAsset(file) {
      return { id: \`asset-\${file.name}\` };
    },
    async createJob(input) {
      return { id: &quot;job-123&quot;, input };
    },
    async getJob() {
      polls += 1;
      if (polls &lt; 3) {
        return { id: &quot;job-123&quot;, status: &quot;processing&quot; };
      }
      return { id: &quot;job-123&quot;, status: &quot;completed&quot; };
    },
    async downloadResult() {
      return { location: &quot;private://rendered-video/job-123.mp4&quot; };
    },
  };
}
</code>`,
    },
  ],

  'tmp/geo-bodies-clean/exq994v0.html': [
    {
      needle: 'For each test case: submit the same input',
      newCode: `<code class="language-text">For each test case:
    submit the same input to every candidate integration
    record request duration, queue duration, and render duration
    save the output with its request metadata
    score lip-sync, visual artifacts, and audio quality
    record failures and retry behavior
    compare cost per successful minute of output
</code>`,
    },
    {
      needle: 'Browser or mobile app |',
      newCode: `<code class="language-text">Browser or mobile app
  |
  | authenticated application request
  v
Your backend
  |
  | provider API key
  v
Avatar or media API
</code>`,
    },
    {
      needle: 'if preferred model is unavailable: mark the job',
      newCode: `<code class="language-text">if preferred model is unavailable:
    mark the job as requiring operator review
    optionally select a preapproved fallback
    record the selected model
    notify the caller that output characteristics may differ
</code>`,
    },
    {
      needle: '# Poll: GET https://www.keyoapi.xyz/v1/task/{task_id}',
      newCode: `<code>curl https://www.keyoapi.xyz/v1/async/videos/image-to-video \\
  -H "Authorization: Bearer YOUR_KEYO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"InfiniteTalk","prompt":"Say hello","image_url":"https://example.com/face.jpg","audio_url":"https://example.com/clip.mp3"}'

# Poll: GET https://www.keyoapi.xyz/v1/task/{task_id}
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
  let html = fs.readFileSync(file, 'utf8');
  for (const { needle, newCode } of items) {
    const idx = html.indexOf(needle);
    if (idx === -1) {
      console.error('NEEDLE NOT FOUND in', file, '->', needle.slice(0, 60));
      process.exit(1);
    }
    const preStart = html.lastIndexOf('<pre', idx);
    const preEnd = html.indexOf('</pre>', idx + needle.length);
    if (preStart === -1 || preEnd === -1) {
      console.error('PRE BOUNDS NOT FOUND in', file, '->', needle.slice(0, 60));
      process.exit(1);
    }
    const oldBlock = html.slice(preStart, preEnd + '</pre>'.length);
    const newBlock = '<pre>' + newCode + '</pre>';
    html = html.slice(0, preStart) + newBlock + html.slice(preEnd + '</pre>'.length);
    total++;
  }
  fs.writeFileSync(file, html);
}
console.log('Reformatted blocks:', total);