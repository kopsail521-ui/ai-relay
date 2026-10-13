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
import type { PricingModel } from '../types'

export function isGiftCreditModel(model: PricingModel): boolean {
  return model.model_name.trim().toLowerCase().endsWith(':free')
}

export function resolveGiftCreditPricing(
  models: PricingModel[]
): PricingModel[] {
  const modelMap = new Map(models.map((model) => [model.model_name, model]))

  return models.map((model) => {
    if (!isGiftCreditModel(model)) return model
    if (model.billing_mode === 'tiered_expr' && model.billing_expr) {
      return { ...model, gift_billing_rate_available: true }
    }

    const twin = modelMap.get(model.model_name.trim().slice(0, -5))
    if (!twin || twin.billing_mode === 'tiered_expr') {
      return { ...model, gift_billing_rate_available: false }
    }

    return {
      ...model,
      quota_type: twin.quota_type,
      model_price: twin.model_price,
      model_ratio: twin.model_ratio,
      completion_ratio: twin.completion_ratio,
      cache_ratio: twin.cache_ratio,
      create_cache_ratio: twin.create_cache_ratio,
      image_ratio: twin.image_ratio,
      audio_ratio: twin.audio_ratio,
      audio_completion_ratio: twin.audio_completion_ratio,
      gift_billing_rate_available: true,
    }
  })
}
