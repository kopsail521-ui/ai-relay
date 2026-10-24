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
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { getModelTokenLimits } from '../../lib/model-helpers'
import type { PricingModel } from '../../types'
import { ModelCard } from '../model-card'

// The icon package imports native JSON that Node's test loader cannot consume.
vi.mock('@lobehub/icons', () => ({}))

const chatModel: PricingModel = {
  id: 1,
  model_name: 'gpt-6-luna',
  quota_type: 0,
  model_ratio: 0.5,
  completion_ratio: 3,
  billing_unit: 'token',
  enable_groups: [],
}

describe('model card billing units', () => {
  it.each([
    ['seedance-2.0', 'second'],
    ['whisper-large-v3', 'request'],
    ['unreviewed-model', undefined],
  ] as const)('does not imply a token window for %s', (modelName, unit) => {
    render(
      <ModelCard
        model={{ ...chatModel, model_name: modelName, billing_unit: unit }}
        onClick={() => undefined}
      />
    )
    expect(screen.queryByText(/^1[MK]$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\/1[MK] tokens/)).not.toBeInTheDocument()
  })

  it.each([
    ['M', '/1M tokens'],
    ['K', '/1K tokens'],
  ] as const)(
    'labels token billing explicitly at the selected %s scale',
    (unit, label) => {
      render(
        <ModelCard
          model={{ ...chatModel, billing_unit: undefined }}
          tokenUnit={unit}
          onClick={() => undefined}
        />
      )
      expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.queryByText(/^1[MK]$/)).not.toBeInTheDocument()
    }
  )

  it('withholds the token unit for gift-credit models without verified rates', () => {
    render(
      <ModelCard
        model={{
          ...chatModel,
          model_name: 'glm-5.3:free',
          gift_billing_rate_available: false,
        }}
        onClick={() => undefined}
      />
    )
    expect(
      screen.getByText('Usage billed · gift credits first')
    ).toBeInTheDocument()
    expect(screen.queryByText(/1[MK]/)).not.toBeInTheDocument()
  })
})

describe('model detail token-window metadata', () => {
  it.each([
    'seedance-2.0',
    'whisper-large-v3',
    'text-embedding-3-large',
    'unreviewed-model',
  ])(
    'hides context and maximum-output token fields for non-chat or unreviewed %s',
    (modelName) => {
      expect(
        getModelTokenLimits({
          ...chatModel,
          model_name: modelName,
          context_length: 1_000_000,
          max_output_tokens: 32_000,
        })
      ).toEqual({})
    }
  )

  it('shows explicitly supplied token-window metadata for a reviewed chat model', () => {
    expect(
      getModelTokenLimits({
        ...chatModel,
        context_length: 128_000,
        max_output_tokens: 32_000,
      })
    ).toEqual({ contextLength: 128_000, maxOutputTokens: 32_000 })
  })

  it('does not invent token-window metadata when the chat catalog omits it', () => {
    expect(getModelTokenLimits(chatModel)).toEqual({})
  })

  it('withholds invalid or unbounded chat token-window values', () => {
    expect(
      getModelTokenLimits({
        ...chatModel,
        context_length: Number.POSITIVE_INFINITY,
        max_output_tokens: -1,
      })
    ).toEqual({})
  })
})
