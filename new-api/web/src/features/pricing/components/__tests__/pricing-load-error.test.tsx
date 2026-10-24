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
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PricingLoadError } from '../pricing-load-error'

describe('model catalog request failure', () => {
  it('shows a request error and lets the user retry', async () => {
    const retry = vi.fn()
    render(<PricingLoadError onRetry={retry} isRetrying={false} />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The model catalog could not be loaded'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })
  it('disables repeat retries while the request is in progress', () => {
    render(<PricingLoadError onRetry={vi.fn()} isRetrying />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
