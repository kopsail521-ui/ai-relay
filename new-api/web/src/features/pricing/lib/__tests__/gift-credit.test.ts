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
import { describe, expect, it } from 'vitest'

import { QUOTA_TYPES } from '../../constants'
import type { PricingModel } from '../../types'
import { filterByQuotaType } from '../filters'
import { isGiftCreditModel, resolveGiftCreditPricing } from '../gift-credit'
import { formatPrice } from '../price'

function model(
  name: string,
  overrides: Partial<PricingModel> = {}
): PricingModel {
  return {
    id: 1,
    model_name: name,
    quota_type: 1,
    model_price: 0,
    model_ratio: 0,
    completion_ratio: 1,
    enable_groups: ['default'],
    ...overrides,
  }
}

describe('gift-credit pricing', () => {
  it('shows twin token rates for a gift model while retaining its API ID and groups', () => {
    const gift = model('glm:free')
    const twin = model('glm', {
      quota_type: 0,
      model_ratio: 0.005,
      completion_ratio: 4,
      cache_ratio: 0.2,
      enable_groups: ['premium'],
    })
    const [resolved, paid] = resolveGiftCreditPricing([gift, twin])

    expect(formatPrice(resolved, 'input', 'M', false, 1, 1, 'default')).toBe(
      '$0.01'
    )
    expect(formatPrice(resolved, 'output', 'M', false, 1, 1, 'default')).toBe(
      '$0.04'
    )
    expect(resolved.model_name).toBe('glm:free')
    expect(resolved.enable_groups).toEqual(['default'])
    expect(resolved.cache_ratio).toBe(0.2)
    expect(resolved.gift_billing_rate_available).toBe(true)
    expect(paid).toBe(twin)
    expect(gift.model_price).toBe(0)
  })

  it('uses twin per-request rates for gift models', () => {
    const [resolved] = resolveGiftCreditPricing([
      model('image:free'),
      model('image', { model_price: 0.03 }),
    ])
    expect(resolved.model_price).toBe(0.03)
    expect(resolved.quota_type).toBe(1)
    expect(resolved.gift_billing_rate_available).toBe(true)
  })

  it('marks missing twin rates unavailable instead of treating public zero as a billing rate', () => {
    const [resolved] = resolveGiftCreditPricing([model('pool:free')])
    expect(resolved.gift_billing_rate_available).toBe(false)
  })

  it('keeps the gift model own dynamic expression instead of substituting its twin', () => {
    const gift = model('dynamic:free', {
      billing_mode: 'tiered_expr',
      billing_expr: 'test',
    })
    const [resolved] = resolveGiftCreditPricing([gift, model('dynamic')])
    expect(resolved.billing_expr).toBe('test')
    expect(resolved.gift_billing_rate_available).toBe(true)
  })

  it('filters gift IDs independently of zero public prices', () => {
    const gift = model('GLM:FREE', { model_price: 0.02 })
    const zeroCost = model('ordinary-zero')
    expect(isGiftCreditModel(gift)).toBe(true)
    expect(isGiftCreditModel(zeroCost)).toBe(false)
    expect(filterByQuotaType([gift, zeroCost], QUOTA_TYPES.FREE)).toEqual([
      gift,
    ])
  })
})
