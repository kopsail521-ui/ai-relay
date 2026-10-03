import { describe, expect, it } from 'vitest'

import {
  STARTER_FREE_MODEL,
  buildCurlCommand,
  formatBearerKey,
  getPreferredKey,
  normalizeEndpoint,
  pickStarterModel,
} from '../starter-curl'

describe('starter-curl', () => {
  it('prefers the catalog free ID', () => {
    expect(pickStarterModel(['gpt-6-astra', STARTER_FREE_MODEL])).toBe(
      STARTER_FREE_MODEL
    )
  })

  it('falls back to any :free id', () => {
    expect(pickStarterModel(['gpt-6-astra', 'gemma-4-26b:free'])).toBe(
      'gemma-4-26b:free'
    )
  })

  it('prefixes sk- when missing', () => {
    expect(formatBearerKey('abc')).toBe('sk-abc')
    expect(formatBearerKey('sk-abc')).toBe('sk-abc')
  })

  it('normalizes /v1 to chat completions', () => {
    expect(normalizeEndpoint('https://www.keyoapi.xyz/v1')).toBe(
      'https://www.keyoapi.xyz/v1/chat/completions'
    )
  })

  it('embeds the real key in curl (no $KEY placeholder)', () => {
    const curl = buildCurlCommand({
      endpoint: 'https://www.keyoapi.xyz/v1/chat/completions',
      apiKey: 'sk-live-example',
      model: STARTER_FREE_MODEL,
    })
    expect(curl).toContain('Bearer sk-live-example')
    expect(curl).toContain(`"model":"${STARTER_FREE_MODEL}"`)
    expect(curl).not.toContain('$KEY')
    expect(curl).not.toContain('YOUR_')
  })

  it('picks an enabled key first', () => {
    const key = getPreferredKey([
      { id: 1, status: 2, name: 'off' },
      { id: 2, status: 1, name: 'on' },
    ] as never)
    expect(key?.id).toBe(2)
  })
})
