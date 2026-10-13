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
import { flexRender } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { resolveGiftCreditPricing } from '../../lib/gift-credit'
import type { PricingModel } from '../../types'
import { ModelCard } from '../model-card'
import { usePricingColumns } from '../pricing-columns'

vi.mock('@/lib/lobe-icon', () => ({ getLobeIcon: () => null }))

const gift: PricingModel = {
  id: 1,
  model_name: 'glm:free',
  quota_type: 1,
  model_price: 0,
  model_ratio: 0,
  completion_ratio: 1,
  enable_groups: [],
  description: 'Old free model description',
}

function PriceCells(props: { model: PricingModel }) {
  const columns = usePricingColumns()
  return (
    <>
      {columns
        .filter(
          (column) =>
            ('accessorKey' in column && column.accessorKey === 'price') ||
            column.id === 'cached_price'
        )
        .map((column) => (
          <div key={column.id ?? 'price'}>
            {flexRender(column.cell, {
              row: { original: props.model },
            } as never)}
          </div>
        ))}
    </>
  )
}

describe('gift-credit model display', () => {
  it('shows the gift label and charging rule instead of zero price when the twin is absent', () => {
    render(<ModelCard model={gift} onClick={() => undefined} />)
    expect(screen.getByText('Gift-credit models')).toBeInTheDocument()
    expect(
      screen.getByText('Usage billed · gift credits first')
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Calls are billed at the corresponding model rate. Gift credits are used first; any shortfall is charged to your recharge balance.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/\$0(?:\.0+)?$/)).not.toBeInTheDocument()
    expect(
      screen.queryByText('Old free model description')
    ).not.toBeInTheDocument()
    expect(screen.getByText('glm:free')).toBeInTheDocument()
  })

  it('shows actual twin rates on the card when catalog data is available', () => {
    const [resolved] = resolveGiftCreditPricing([
      gift,
      {
        ...gift,
        model_name: 'glm',
        quota_type: 0,
        model_ratio: 0.005,
        completion_ratio: 4,
      },
    ])
    render(
      <ModelCard
        model={resolved}
        showRechargePrice
        priceRate={0.5}
        onClick={() => undefined}
      />
    )
    expect(screen.getByText('$0.01')).toBeInTheDocument()
    expect(screen.getByText('$0.04')).toBeInTheDocument()
    expect(screen.getByText('Gift-credit models')).toBeInTheDocument()
  })

  it('hides zero public rates in table price and cache columns when the twin is absent', () => {
    render(<PriceCells model={gift} />)
    expect(
      screen.getAllByText('Usage billed · gift credits first')
    ).toHaveLength(2)
    expect(screen.queryByText(/\$0/)).not.toBeInTheDocument()
  })

  it('retains a real zero per-request rate for ordinary models', () => {
    render(
      <ModelCard
        model={{ ...gift, model_name: 'ordinary-zero' }}
        onClick={() => undefined}
      />
    )
    expect(screen.queryByText('Gift-credit models')).not.toBeInTheDocument()
    expect(screen.getByText('$0')).toBeInTheDocument()
  })
})
