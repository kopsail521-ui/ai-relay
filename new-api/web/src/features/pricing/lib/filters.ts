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
import {
  SORT_OPTIONS,
  FILTER_ALL,
  QUOTA_TYPES,
  QUOTA_TYPE_VALUES,
  ENDPOINT_TYPES,
} from '../constants'
import type { PricingModel } from '../types'
import { getDynamicPricingTiers } from './dynamic-price'
import { getDisplayGroupRatio } from './model-helpers'

// ----------------------------------------------------------------------------
// Filter Utilities
// ----------------------------------------------------------------------------

/**
 * Normalize text for fault-tolerant search matching: lowercase and strip
 * separators (- _ . whitespace) so "gpt4o" matches "gpt-4o".
 */
function normalizeForSearch(value: string): string {
  return value.toLowerCase().replace(/[-_.\s]+/g, '')
}

/**
 * Filter models by search query
 */
export function filterBySearch(
  models: PricingModel[],
  query: string
): PricingModel[] {
  if (!query) return models

  const normalizedQuery = normalizeForSearch(query)
  if (!normalizedQuery) return models

  return models.filter((m) =>
    [m.model_name, m.description, m.tags, m.vendor_name].some((target) =>
      normalizeForSearch(target ?? '').includes(normalizedQuery)
    )
  )
}

/**
 * Filter models by vendor
 */
export function filterByVendor(
  models: PricingModel[],
  vendor: string
): PricingModel[] {
  if (vendor === FILTER_ALL) return models
  return models.filter((m) => m.vendor_name === vendor)
}

/**
 * Filter models by group
 */
export function filterByGroup(
  models: PricingModel[],
  group: string
): PricingModel[] {
  if (group === FILTER_ALL) return models
  return models.filter((m) => m.enable_groups?.includes(group))
}

/**
 * True when the model costs nothing: per-request price is 0 (ModelPrice=0)
 * or token ratio is 0. Used by the 免费 pricing-type filter.
 */
export function isFreeModel(model: PricingModel): boolean {
  if (model.quota_type === 1) {
    return Number(model.model_price ?? 0) === 0
  }
  return Number(model.model_ratio ?? 0) === 0
}

/**
 * Filter models by quota type
 */
export function filterByQuotaType(
  models: PricingModel[],
  quotaType: string
): PricingModel[] {
  if (quotaType === QUOTA_TYPES.ALL) return models
  if (quotaType === QUOTA_TYPES.FREE) {
    return models.filter(isFreeModel)
  }
  const targetType =
    quotaType === QUOTA_TYPES.TOKEN
      ? QUOTA_TYPE_VALUES.TOKEN
      : QUOTA_TYPE_VALUES.REQUEST
  return models.filter((m) => m.quota_type === targetType)
}

/**
 * Filter models by endpoint type
 */
export function filterByEndpointType(
  models: PricingModel[],
  endpointType: string
): PricingModel[] {
  if (endpointType === ENDPOINT_TYPES.ALL) return models
  return models.filter((m) =>
    m.supported_endpoint_types?.includes(endpointType)
  )
}

/**
 * Get the sort key for price sorting: the USD input price per 1M tokens,
 * derived from the same base as formatPrice (model_ratio × 2 × group ratio,
 * completion_ratio does not apply to the input price). Dynamic tiered models
 * use their first tier's input price with the same group ratio.
 */
function getModelSortPrice(
  model: PricingModel,
  selectedGroup?: string
): number {
  const groupRatio = getDisplayGroupRatio(model, selectedGroup)

  const dynamicTiers = getDynamicPricingTiers(model)
  if (dynamicTiers.length > 0) {
    const dynamicInput = Number(dynamicTiers[0]?.inputPrice)
    if (Number.isFinite(dynamicInput) && dynamicInput > 0) {
      return dynamicInput * groupRatio
    }
  }

  const modelRatio = Number(model.model_ratio ?? 0)
  if (!Number.isFinite(modelRatio)) {
    return Number.POSITIVE_INFINITY
  }
  return modelRatio * 2 * groupRatio
}

/**
 * Sort models by specified option
 */
export function sortModels(
  models: PricingModel[],
  sortBy: string,
  selectedGroup?: string
): PricingModel[] {
  const sorted = [...models]

  switch (sortBy) {
    case SORT_OPTIONS.NAME:
      // 保留 /api/pricing 返回顺序（代理层已按供应商固定序 + 同厂商新→旧）
      break
    case SORT_OPTIONS.PRICE_LOW:
    case SORT_OPTIONS.PRICE_HIGH: {
      // 按次计费模型与 token 模型价格不可比，固定排在 token 模型之后
      const tokenModels = sorted.filter(
        (m) => m.quota_type !== QUOTA_TYPE_VALUES.REQUEST
      )
      const requestModels = sorted.filter(
        (m) => m.quota_type === QUOTA_TYPE_VALUES.REQUEST
      )
      // Precompute keys: dynamic tiered models re-parse billing expressions
      const priceKeys = new Map<PricingModel, number>()
      for (const model of tokenModels) {
        priceKeys.set(model, getModelSortPrice(model, selectedGroup))
      }
      tokenModels.sort((a, b) => {
        const diff =
          (priceKeys.get(a) ?? 0) - (priceKeys.get(b) ?? 0)
        return sortBy === SORT_OPTIONS.PRICE_LOW ? diff : -diff
      })
      return [...tokenModels, ...requestModels]
    }
  }

  return sorted
}

/**
 * Apply all filters and sorting to models
 */
export function filterAndSortModels(
  models: PricingModel[],
  filters: {
    search: string
    vendor: string
    group: string
    quotaType: string
    endpointType: string
    tag: string
    sortBy: string
  }
): PricingModel[] {
  let result = filterBySearch(models, filters.search)
  result = filterByVendor(result, filters.vendor)
  result = filterByGroup(result, filters.group)
  result = filterByQuotaType(result, filters.quotaType)
  result = filterByEndpointType(result, filters.endpointType)
  result = filterByTag(result, filters.tag)
  result = sortModels(result, filters.sortBy, filters.group)

  return result
}

/**
 * Parse tags from comma-separated string
 */
export function parseTags(tagsString?: string): string[] {
  if (!tagsString) return []
  return tagsString
    .split(/[,;|\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Extract all unique tags from models
 */
export function extractAllTags(models: PricingModel[]): string[] {
  const tagSet = new Set<string>()

  models.forEach((model) => {
    if (model.tags) {
      const tags = parseTags(model.tags)
      tags.forEach((tag) => {
        tagSet.add(tag.toLowerCase())
      })
    }
  })

  return Array.from(tagSet).sort((a, b) => a.localeCompare(b))
}

/**
 * Filter models by tag
 */
export function filterByTag(
  models: PricingModel[],
  tag: string
): PricingModel[] {
  if (tag === FILTER_ALL) return models

  const tagLower = tag.toLowerCase()
  return models.filter((m) => {
    if (!m.tags) return false
    const modelTags = parseTags(m.tags).map((t) => t.toLowerCase())
    return modelTags.includes(tagLower)
  })
}
