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

import { isGiftCreditModel } from '../lib/gift-credit'
import { getModelContract } from '../lib/model-api-contracts'
import { formatBillingUnitPrice } from '../lib/price'
import type { PricingModel } from '../types'

export function ModelUnitPrice(props: {
  model: PricingModel
  showRechargePrice?: boolean
  priceRate?: number
  usdExchangeRate?: number
  selectedGroup?: string
}) {
  const { t } = useTranslation()
  if (getModelContract(props.model.model_name)?.kind === 'unknown') {
    return (
      <span className='text-muted-foreground text-sm'>
        {t('Billing method not confirmed. Contact support.')}
      </span>
    )
  }
  if (
    isGiftCreditModel(props.model) &&
    !props.model.gift_billing_rate_available
  ) {
    return (
      <span className='text-muted-foreground text-xs'>
        {t('Usage billed · gift credits first')}
      </span>
    )
  }
  if (props.model.has_price_tiers) {
    return (
      <a
        href='/pricing-list'
        onClick={(event) => event.stopPropagation()}
        className='text-primary text-sm underline underline-offset-4'
      >
        {t('Priced by specification; see the price table')}
      </a>
    )
  }
  const units = {
    request: 'request',
    second: 'second',
    page: 'page',
    character: 'character',
    '10k_chars': '10,000 characters',
    million_chars: '1,000,000 input characters',
  }
  const unit = props.model.billing_unit
  const label = unit && unit !== 'token' ? units[unit] : ''
  const price = formatBillingUnitPrice(
    props.model,
    props.showRechargePrice,
    props.priceRate,
    props.usdExchangeRate,
    props.selectedGroup
  )
  return (
    <span className='font-mono text-sm'>
      {price} <span className='text-muted-foreground'>/ {t(label)}</span>
    </span>
  )
}
