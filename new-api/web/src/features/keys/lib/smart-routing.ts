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
import type { ApiKeyGroupOption } from '../components/api-key-group-combobox'

export type RoutingStrategy = 'smart' | 'price' | 'stability' | 'speed'

export interface RoutingStrategyConfig {
  value: RoutingStrategy
  label: string
  subLabel: string
  description: string
}

export const ROUTING_STRATEGIES: RoutingStrategyConfig[] = [
  {
    value: 'smart',
    label: 'Smart Auto',
    subLabel: '(Optimal)',
    description: 'Combined optimal multi-factor routing and automatic relay',
  },
  {
    value: 'stability',
    label: 'Stability First',
    subLabel: '(Most Stable)',
    description: 'Prioritize VIP and dedicated high-availability channels',
  },
  {
    value: 'price',
    label: 'Price First',
    subLabel: '(Lowest Cost)',
    description: 'Prioritize channels with the lowest multiplier ratio',
  },
  {
    value: 'speed',
    label: 'Speed First',
    subLabel: '(Fastest)',
    description: 'Prioritize channels with the lowest initial latency',
  },
]

/**
 * Computes an ordered list of group names based on the selected strategy.
 */
export function computeStrategyGroupOrder(
  strategy: RoutingStrategy,
  availableOptions: ApiKeyGroupOption[],
  globalAutoGroups: string[],
  maxCount = 5
): string[] {
  const candidates = availableOptions.filter((opt) => opt.value !== 'auto')
  if (candidates.length === 0) return []

  const candidateMap = new Map(candidates.map((c) => [c.value, c]))
  let sorted: string[] = []

  switch (strategy) {
    case 'price': {
      // Sort ascending by ratio (lowest cost first)
      const sortedCandidates = [...candidates].sort((a, b) => {
        const ratioA = typeof a.ratio === 'number' ? a.ratio : 1
        const ratioB = typeof b.ratio === 'number' ? b.ratio : 1
        if (ratioA !== ratioB) {
          return ratioA - ratioB
        }
        return a.value.localeCompare(b.value)
      })
      sorted = sortedCandidates.map((c) => c.value)
      break
    }

    case 'stability': {
      const getStabilityScore = (opt: ApiKeyGroupOption) => {
        const val = opt.value.toLowerCase()
        if (
          val.includes('vip') ||
          val.includes('svip') ||
          val.includes('dedicated')
        ) {
          return 100
        }
        if (val.includes('pro') || val.includes('enterprise')) {
          return 80
        }
        if (val === 'default') {
          return 50
        }
        return 10
      }
      const sortedCandidates = [...candidates].sort((a, b) => {
        const scoreA = getStabilityScore(a)
        const scoreB = getStabilityScore(b)
        if (scoreA !== scoreB) {
          return scoreB - scoreA
        }
        return a.value.localeCompare(b.value)
      })
      sorted = sortedCandidates.map((c) => c.value)
      break
    }

    case 'speed': {
      const getSpeedScore = (opt: ApiKeyGroupOption) => {
        const val = opt.value.toLowerCase()
        if (
          val.includes('fast') ||
          val.includes('speed') ||
          val.includes('direct') ||
          val.includes('turbo')
        ) {
          return 100
        }
        if (val === 'default') {
          return 50
        }
        return 10
      }
      const sortedCandidates = [...candidates].sort((a, b) => {
        const scoreA = getSpeedScore(a)
        const scoreB = getSpeedScore(b)
        if (scoreA !== scoreB) {
          return scoreB - scoreA
        }
        return a.value.localeCompare(b.value)
      })
      sorted = sortedCandidates.map((c) => c.value)
      break
    }

    case 'smart':
    default: {
      const result: string[] = []
      const seen = new Set<string>()

      for (const g of globalAutoGroups) {
        if (candidateMap.has(g) && !seen.has(g)) {
          seen.add(g)
          result.push(g)
        }
      }

      for (const c of candidates) {
        if (!seen.has(c.value)) {
          seen.add(c.value)
          result.push(c.value)
        }
      }

      sorted = result
      break
    }
  }

  return sorted.slice(0, Math.max(1, maxCount))
}

/**
 * Checks if a given group list matches a strategy order.
 */
export function detectStrategyFromGroups(
  groups: string[],
  availableOptions: ApiKeyGroupOption[],
  globalAutoGroups: string[],
  maxCount = 5
): RoutingStrategy {
  if (!groups || groups.length === 0) return 'smart'

  const priceOrder = computeStrategyGroupOrder(
    'price',
    availableOptions,
    globalAutoGroups,
    maxCount
  )
  if (arraysEqual(groups, priceOrder.slice(0, groups.length))) {
    return 'price'
  }

  const stabilityOrder = computeStrategyGroupOrder(
    'stability',
    availableOptions,
    globalAutoGroups,
    maxCount
  )
  if (arraysEqual(groups, stabilityOrder.slice(0, groups.length))) {
    return 'stability'
  }

  const speedOrder = computeStrategyGroupOrder(
    'speed',
    availableOptions,
    globalAutoGroups,
    maxCount
  )
  if (arraysEqual(groups, speedOrder.slice(0, groups.length))) {
    return 'speed'
  }

  return 'smart'
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((val, idx) => val === b[idx])
}
