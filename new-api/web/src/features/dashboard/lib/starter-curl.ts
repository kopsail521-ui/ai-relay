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
import { createApiKey, fetchTokenKey, getApiKeys } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import { getUserModels } from '@/lib/api'

/** Prefer a $0 catalog ID so first curl works without recharge. */
export const STARTER_FREE_MODEL = 'glm-5.3-flash:free'

export function getPreferredKey(keys: ApiKey[]): ApiKey | null {
  return keys.find((item) => item.status === 1) ?? keys[0] ?? null
}

export function pickStarterModel(models: string[] | undefined): string {
  if (!models?.length) return STARTER_FREE_MODEL
  if (models.includes(STARTER_FREE_MODEL)) return STARTER_FREE_MODEL
  const freeId = models.find((id) => id.endsWith(':free') || id.endsWith('-free'))
  return freeId ?? models[0] ?? STARTER_FREE_MODEL
}

function getCurrentOrigin(): string {
  if (typeof window === 'undefined') return 'https://www.keyoapi.xyz'
  return window.location.origin
}

export function normalizeEndpoint(sourceUrl?: string): string {
  const fallback = `${getCurrentOrigin()}/v1/chat/completions`
  const trimmed = sourceUrl?.trim()
  if (!trimmed) return fallback

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '')
  if (withoutTrailingSlash.endsWith('/v1/chat/completions')) {
    return withoutTrailingSlash
  }
  if (withoutTrailingSlash.endsWith('/v1')) {
    return `${withoutTrailingSlash}/chat/completions`
  }
  return `${withoutTrailingSlash}/v1/chat/completions`
}

export function formatBearerKey(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('sk-') ? trimmed : `sk-${trimmed}`
}

export function buildCurlCommand(args: {
  endpoint: string
  apiKey: string
  model: string
}): string {
  return [
    `curl ${args.endpoint} \\`,
    '  -H "Content-Type: application/json" \\',
    `  -H "Authorization: Bearer ${args.apiKey}" \\`,
    `  -d '{"model":"${args.model}","messages":[{"role":"user","content":"Say hello in one sentence."}]}'`,
  ].join('\n')
}

async function ensureStarterKeyId(): Promise<number | null> {
  const listed = await getApiKeys({ p: 1, size: 10 })
  const existing = listed.success ? (listed.data?.items ?? []) : []
  const preferred = getPreferredKey(existing)
  if (preferred?.id) return preferred.id

  const created = await createApiKey({
    name: 'starter',
    remain_quota: 0,
    expired_time: -1,
    unlimited_quota: true,
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
    group: '',
    auto_groups: [],
    cross_group_retry: false,
  })
  if (created.success && created.data?.id) return created.data.id

  const again = await getApiKeys({ p: 1, size: 10 })
  const after = again.success ? (again.data?.items ?? []) : []
  return getPreferredKey(after)?.id ?? null
}

/** Resolve a ready-to-paste curl with the user's real API key. */
export async function resolveStarterCurl(args?: {
  endpointHint?: string
}): Promise<{
  curl: string
  model: string
  endpoint: string
  apiKey: string
} | null> {
  const keyId = await ensureStarterKeyId()
  if (!keyId) return null

  const secret = await fetchTokenKey(keyId)
  const raw = secret.success && secret.data?.key ? secret.data.key : ''
  const apiKey = formatBearerKey(raw)
  if (!apiKey) return null

  let models: string[] = []
  try {
    const res = await getUserModels()
    if (res.success && Array.isArray(res.data)) models = res.data
  } catch {
    // fall back to default free model
  }
  const model = pickStarterModel(models)
  const endpoint = normalizeEndpoint(args?.endpointHint)
  return {
    apiKey,
    model,
    endpoint,
    curl: buildCurlCommand({ endpoint, apiKey, model }),
  }
}
