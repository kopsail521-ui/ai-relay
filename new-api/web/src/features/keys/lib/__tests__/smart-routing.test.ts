import { describe, expect, test } from 'vitest'

import type { ApiKeyGroupOption } from '../../components/api-key-group-combobox'
import {
  computeStrategyGroupOrder,
  detectStrategyFromGroups,
  ROUTING_STRATEGIES,
} from '../smart-routing'

describe('Smart Routing Strategy Computations', () => {
  const mockOptions: ApiKeyGroupOption[] = [
    { value: 'auto', label: 'Auto routing' },
    { value: 'default', label: 'Default', ratio: 1.0 },
    { value: 'GPT-Image-HD', label: 'GPT Image HD', ratio: 13.140553 },
    { value: 'GPT-Image-Pro', label: 'GPT Image Pro', ratio: 0.576 },
    { value: 'vip', label: 'VIP Priority', ratio: 2.0 },
  ]

  const globalAutoGroups = ['vip', 'default', 'GPT-Image-Pro']

  test('ROUTING_STRATEGIES has the 4 expected presets', () => {
    expect(ROUTING_STRATEGIES.map((s) => s.value)).toEqual([
      'smart',
      'stability',
      'price',
      'speed',
    ])
  })

  test('price-first strategy orders groups ascending by ratio (cheapest first)', () => {
    const order = computeStrategyGroupOrder('price', mockOptions, globalAutoGroups, 5)
    expect(order).toEqual([
      'GPT-Image-Pro', // 0.576
      'default',       // 1.0
      'vip',           // 2.0
      'GPT-Image-HD',  // 13.14
    ])
  })

  test('stability-first strategy prioritizes VIP / high tier before default', () => {
    const order = computeStrategyGroupOrder('stability', mockOptions, globalAutoGroups, 5)
    expect(order[0]).toBe('vip')
    expect(order[1]).toBe('GPT-Image-Pro')
    expect(order[2]).toBe('default')
  })

  test('smart strategy prioritizes configured global auto groups', () => {
    const order = computeStrategyGroupOrder('smart', mockOptions, globalAutoGroups, 5)
    expect(order.slice(0, 3)).toEqual(['vip', 'default', 'GPT-Image-Pro'])
    expect(order[3]).toBe('GPT-Image-HD')
  })

  test('respects maxCount limit', () => {
    const order = computeStrategyGroupOrder('price', mockOptions, globalAutoGroups, 2)
    expect(order).toEqual(['GPT-Image-Pro', 'default'])
  })

  test('detects strategy from group order correctly', () => {
    const priceOrder = ['GPT-Image-Pro', 'default', 'vip', 'GPT-Image-HD']
    expect(detectStrategyFromGroups(priceOrder, mockOptions, globalAutoGroups, 5)).toBe('price')

    const stabilityOrder = ['vip', 'GPT-Image-Pro', 'default', 'GPT-Image-HD']
    expect(detectStrategyFromGroups(stabilityOrder, mockOptions, globalAutoGroups, 5)).toBe('stability')

    expect(detectStrategyFromGroups([], mockOptions, globalAutoGroups, 5)).toBe('smart')
  })
})
