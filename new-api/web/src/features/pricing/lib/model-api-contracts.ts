/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import contractData from './model-contracts.json'

export type SampleLanguage = 'curl' | 'python' | 'typescript' | 'javascript'
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ModelApiRequest = {
  label: string
  path: string
  method?: 'POST' | 'GET'
  body?: Record<string, JsonValue>
  fields?: Record<string, string>
  files?: Record<string, string>
  auth?: 'gemini' | 'anthropic'
  pollPath?: string
  output?: string
  noteKey?: string
}

export type ModelApiContract = { kind: string; requests: ModelApiRequest[] }
const contracts = contractData as unknown as Record<string, ModelApiContract>

/** Only explicitly reviewed models receive executable examples. */
export function getModelContract(
  modelName: string
): ModelApiContract | undefined {
  return Object.hasOwn(contracts, modelName) ? contracts[modelName] : undefined
}

export function getModelRequests(
  modelName: string,
  endpointMap: Record<string, { path?: string; method?: string }> = {}
): ModelApiRequest[] {
  const contract = getModelContract(modelName)
  if (!contract) return []
  if (contract.kind !== 'chat') return contract.requests

  const message = 'Explain quantum entanglement in one paragraph.'
  const requests: ModelApiRequest[] = [
    {
      label: 'Chat Completions',
      path: '/v1/chat/completions',
      body: {
        model: modelName,
        messages: [{ role: 'user', content: message }],
      },
    },
  ]
  if (endpointMap['openai-response']) {
    requests.push({
      label: 'Responses',
      path: '/v1/responses',
      body: { model: modelName, input: message },
    })
  }
  if (endpointMap.anthropic) {
    requests.push({
      label: 'Anthropic Messages',
      path: '/v1/messages',
      auth: 'anthropic',
      body: {
        model: modelName,
        max_tokens: 1024,
        messages: [{ role: 'user', content: message }],
      },
    })
  }
  if (endpointMap.gemini) {
    requests.push({
      label: 'Gemini REST',
      path: `/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      auth: 'gemini',
      body: { contents: [{ parts: [{ text: message }] }] },
    })
  }
  return requests
}

/** REST is explicit about the destination, including in Python and Node.js. */
export function buildRequestSample(
  lang: SampleLanguage,
  request: ModelApiRequest,
  baseUrl: string
): string {
  const url = `${baseUrl.replace(/\/$/, '')}${request.path}`
  const method = request.method || 'POST'
  let authHeader = 'Authorization'
  let authPrefix = 'Bearer '
  if (request.auth === 'gemini' || request.auth === 'anthropic') {
    authHeader = request.auth === 'gemini' ? 'x-goog-api-key' : 'x-api-key'
    authPrefix = ''
  }
  const isMultipart = Boolean(request.files || request.fields)
  const json = JSON.stringify(request.body, null, 2)
  const extraHeaders: Record<string, string> = {}
  if (request.auth === 'anthropic') {
    extraHeaders['anthropic-version'] = '2023-06-01'
  }
  if (request.body) extraHeaders['Content-Type'] = 'application/json'

  if (lang === 'curl') {
    const lines = [
      `curl --fail-with-body --request ${method} "${url.replace('{id}', '$TASK_ID')}" \\`,
      `  -H "${authHeader}: ${authPrefix}$NEW_API_KEY"`,
      ...Object.entries(extraHeaders).map(
        ([key, value]) => `  -H "${key}: ${value}"`
      ),
      ...Object.entries(request.fields || {}).map(
        ([key, value]) =>
          `  --form-string '${key}=${value.replaceAll("'", "'\\''")}'`
      ),
      ...Object.entries(request.files || {}).map(
        ([key, value]) => `  -F '${key}=@./${value}'`
      ),
    ]
    if (request.body) lines.push(`  -d '${json.replaceAll("'", "'\\''")}'`)
    if (request.output) lines.push(`  --output ${request.output}`)
    return lines
      .map((line, index) =>
        index === 0 || index === lines.length - 1 ? line : `${line} \\`
      )
      .join('\n')
  }

  if (lang === 'python') {
    const lines = ['import os', 'import json', 'import requests']
    if (isMultipart) lines.push('from contextlib import ExitStack')
    lines.push(
      '',
      `url = "${url}".replace("{id}", os.environ.get("TASK_ID", "TASK_ID_FROM_CREATE_RESPONSE"))`,
      `headers = {"${authHeader}": "${authPrefix}" + os.environ["NEW_API_KEY"]}`
    )
    for (const [key, value] of Object.entries(extraHeaders)) {
      lines.push(`headers[${JSON.stringify(key)}] = ${JSON.stringify(value)}`)
    }
    if (request.body) lines.push(`payload = json.loads(r'''${json}''')`)
    let indent = ''
    if (isMultipart) {
      lines.push('with ExitStack() as stack:')
      indent = '    '
      lines.push(
        `    files = {${Object.entries(request.files || {})
          .map(
            ([key, value]) =>
              `${JSON.stringify(key)}: stack.enter_context(open(${JSON.stringify(value)}, "rb"))`
          )
          .join(', ')}}`
      )
    }
    const args = [`"${method}"`, 'url', 'headers=headers', 'timeout=120']
    if (request.body) args.push('json=payload')
    if (isMultipart) {
      args.push(`data=${JSON.stringify(request.fields || {})}`, 'files=files')
    }
    lines.push(
      `${indent}response = requests.request(${args.join(', ')})`,
      `${indent}response.raise_for_status()`
    )
    if (request.output) {
      lines.push(
        `with open(${JSON.stringify(request.output)}, "wb") as output:`,
        '    output.write(response.content)'
      )
    } else lines.push('print(response.json())')
    return lines.join('\n')
  }

  const lines: string[] = []
  if (isMultipart) lines.push("import { readFile } from 'node:fs/promises'")
  if (request.output) lines.push("import { writeFile } from 'node:fs/promises'")
  lines.push(
    `const apiKey = process.env.NEW_API_KEY`,
    "if (!apiKey) throw new Error('Set NEW_API_KEY before running')"
  )
  if (isMultipart) {
    lines.push('const form = new FormData()')
    for (const [key, value] of Object.entries(request.fields || {})) {
      lines.push(
        `form.append(${JSON.stringify(key)}, ${JSON.stringify(value)})`
      )
    }
    for (const [key, value] of Object.entries(request.files || {})) {
      lines.push(
        `form.append(${JSON.stringify(key)}, new Blob([new Uint8Array(await readFile(${JSON.stringify(value)}))]), ${JSON.stringify(value)})`
      )
    }
  }
  lines.push(
    `const url = ${JSON.stringify(url)}.replace('{id}', process.env.TASK_ID || 'TASK_ID_FROM_CREATE_RESPONSE')`,
    'const response = await fetch(url, {',
    `  method: '${method}',`,
    '  headers: {',
    `    '${authHeader}': ${authPrefix ? '`Bearer ${apiKey}`' : 'apiKey'},`,
    ...Object.entries(extraHeaders).map(
      ([key, value]) => `    '${key}': ${JSON.stringify(value)},`
    ),
    '  },'
  )
  if (request.body) lines.push(`  body: JSON.stringify(${json}),`)
  if (isMultipart) lines.push('  body: form,')
  lines.push(
    '  signal: AbortSignal.timeout(120_000),',
    '})',
    'if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`)'
  )
  if (request.output) {
    lines.push(
      `await writeFile(${JSON.stringify(request.output)}, Buffer.from(await response.arrayBuffer()))`
    )
  } else lines.push('console.log(await response.json())')
  return lines.join('\n')
}

export function getExampleFields(
  request: ModelApiRequest
): { name: string; type: string }[] {
  return [
    ...Object.entries(request.body || request.fields || {}).map(
      ([name, value]) => ({
        name,
        type: Array.isArray(value) ? 'array' : typeof value,
      })
    ),
    ...Object.keys(request.files || {}).map((name) => ({ name, type: 'file' })),
  ]
}
