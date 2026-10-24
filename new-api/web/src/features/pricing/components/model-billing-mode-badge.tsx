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
import { useTranslation } from 'react-i18next'

import { StatusBadge, type StatusVariant } from '@/components/status-badge'

import { isDynamicPricingModel } from '../lib/dynamic-price'
import { isGiftCreditModel } from '../lib/gift-credit'
import { getModelContract } from '../lib/model-api-contracts'
import { isTokenBasedModel } from '../lib/model-helpers'
import type { PricingModel } from '../types'

interface ModelBillingModeBadgeProps {
  model: PricingModel
  className?: string
}

export function ModelBillingModeBadge(props: ModelBillingModeBadgeProps) {
  const { t } = useTranslation()
  let label = t('Per Request')
  let variant: StatusVariant = 'purple'

  if (isGiftCreditModel(props.model)) {
    label = t('Gift-credit models')
    variant = 'success'
  } else if (getModelContract(props.model.model_name)?.kind === 'unknown') {
    label = t('Billing method not confirmed. Contact support.')
    variant = 'warning'
  } else if (props.model.has_price_tiers) {
    label = t('Priced by specification')
    variant = 'info'
  } else if (props.model.billing_unit && props.model.billing_unit !== 'token') {
    const labels = {
      request: 'Per Request',
      second: 'Per second',
      page: 'Per page',
      character: 'Per character',
      '10k_chars': 'Per 10,000 characters',
      million_chars: 'Per 1,000,000 input characters',
    }
    label = t(labels[props.model.billing_unit])
    variant = 'info'
  } else if (isDynamicPricingModel(props.model)) {
    label = t('Dynamic Pricing')
    variant = 'warning'
  } else if (isTokenBasedModel(props.model)) {
    label = t('Token-based')
    variant = 'info'
  }

  return (
    <StatusBadge
      label={label}
      variant={variant}
      copyable={false}
      size='sm'
      className={props.className}
    />
  )
}
