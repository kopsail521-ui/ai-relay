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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ENDPOINT_TYPES } from '../../constants'
import { filterByEndpointType } from '../../lib/filters'
import type { PricingModel } from '../../types'
import { PricingSidebar, type PricingSidebarProps } from '../pricing-sidebar'

vi.mock('@/lib/lobe-icon', () => ({ getLobeIcon: () => null }))

function model(
  model_name: string,
  supported_endpoint_types: string[]
): PricingModel {
  return {
    id: 1,
    model_name,
    supported_endpoint_types,
    quota_type: 1,
    model_ratio: 0,
    completion_ratio: 1,
    enable_groups: [],
  }
}
const models = [
  model('seedance-2.5', ['video:/v1/videos/generations']),
  model('grok-video-1.5', ['video:/v1/chat/completions']),
  model('nano-banana-2', ['image-generation:/v1/images/generations']),
  model('WeMM-Embedding-9B', ['embedding:/v1/embeddings']),
  model('whisper-large-v3', ['transcription:/v1/audio/transcriptions']),
  model('Unlimited-OCR', ['ocr:/v1/chat/completions']),
  model('gemini-4-barium', ['openai']),
]
function sidebarProps(): PricingSidebarProps {
  return {
    models,
    vendors: [],
    groups: [],
    tags: [],
    quotaTypeFilter: 'all',
    endpointTypeFilter: 'all',
    vendorFilter: 'all',
    groupFilter: 'all',
    tagFilter: 'all',
    onQuotaTypeChange: vi.fn(),
    onEndpointTypeChange: vi.fn(),
    onVendorChange: vi.fn(),
    onGroupChange: vi.fn(),
    onTagChange: vi.fn(),
    hasActiveFilters: false,
    onClearFilters: vi.fn(),
  }
}

describe('model contract endpoint filtering', () => {
  it('groups video contracts by capability even when their HTTP request uses the chat route', () => {
    expect(
      filterByEndpointType(models, ENDPOINT_TYPES.OPENAI_VIDEO).map(
        (item) => item.model_name
      )
    ).toEqual(['seedance-2.5', 'grok-video-1.5'])
    expect(
      filterByEndpointType(models, ENDPOINT_TYPES.OPENAI).map(
        (item) => item.model_name
      )
    ).toEqual(['gemini-4-barium'])
  })
  it('maps new image and singular embedding keys to existing filter links', () => {
    expect(
      filterByEndpointType(models, ENDPOINT_TYPES.IMAGE_GENERATION).map(
        (item) => item.model_name
      )
    ).toEqual(['nano-banana-2'])
    expect(
      filterByEndpointType(models, ENDPOINT_TYPES.EMBEDDINGS).map(
        (item) => item.model_name
      )
    ).toEqual(['WeMM-Embedding-9B'])
  })
  it('preserves exact contract links and legacy protocol declarations', () => {
    expect(
      filterByEndpointType(models, 'video:/v1/videos/generations').map(
        (item) => item.model_name
      )
    ).toEqual(['seedance-2.5'])
    const legacy = model('native-chat', ['gemini', 'openai-response'])
    expect(filterByEndpointType([legacy], 'gemini')).toEqual([legacy])
    expect(filterByEndpointType([legacy], 'openai-response')).toEqual([legacy])
    expect(filterByEndpointType(models, 'gemini')).toEqual([])
  })
  it('shows semantic counts and newly available endpoint families in the sidebar', async () => {
    const props = sidebarProps()
    render(<PricingSidebar {...props} />)
    const video = screen.getByRole('button', { name: /^Video/ })
    expect(within(video).getByText('2')).toBeInTheDocument()
    expect(
      within(screen.getByRole('button', { name: /^Image/ })).getByText('1')
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('button', { name: /^Embeddings/ })).getByText('1')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Speech recognition/ })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^OCR/ })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Gemini/ })
    ).not.toBeInTheDocument()
    await userEvent.click(video)
    expect(props.onEndpointTypeChange).toHaveBeenCalledWith(
      ENDPOINT_TYPES.OPENAI_VIDEO
    )
  })
  it('keeps a selected unavailable endpoint visible so an existing link can be cleared', () => {
    render(<PricingSidebar {...sidebarProps()} endpointTypeFilter='gemini' />)
    expect(
      within(screen.getByRole('button', { name: /^Gemini/ })).getByText('0')
    ).toBeInTheDocument()
  })
})
