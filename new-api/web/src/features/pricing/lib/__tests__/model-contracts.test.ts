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

import {
  buildRequestSample,
  getModelContract,
  getModelRequests,
} from '../model-api-contracts'

describe('model-specific integration examples', () => {
  it('uses the video task endpoint and plural polling for Seedance', () => {
    const [request] = getModelRequests('seedance-2.5')
    expect(request.path).toBe('/v1/videos/generations')
    expect(request.pollPath).toBe('/v1/tasks/{id}')
    expect(request.body).not.toHaveProperty('messages')
  })

  it('uploads portrait and short audio fields for InfiniteTalk', () => {
    const [request] = getModelRequests('InfiniteTalk')
    expect(request.files).toEqual({
      cond_video: 'portrait.png',
      cond_audio: 'speech.wav',
    })
    expect(request.fields).toHaveProperty('prompt')
    expect(request.pollPath).toBe('/v1/task/{id}')
  })

  it('keeps OCR multimodal and embedding input distinct from general chat', () => {
    expect(getModelRequests('Unlimited-OCR')[0].body).toHaveProperty(
      'messages.0.content.1.image_url.url'
    )
    expect(getModelRequests('WeMM-Embedding-9B')[0].body).toHaveProperty(
      'input'
    )
    expect(getModelRequests('WeMM-Embedding-9B')[0].path).toBe('/v1/embeddings')
  })

  it('does not invent chat examples for undocumented dedicated models or new IDs', () => {
    expect(getModelContract('suno_music')?.kind).toBe('unknown')
    expect(getModelRequests('suno_music')).toEqual([])
    expect(getModelRequests('future-video-model')).toEqual([])
    expect(getModelRequests('nsfw-classifier')).toEqual([])
  })

  it('uses speech bytes for Gemini TTS and video tasks for FLUX video', () => {
    expect(getModelRequests('gemini-3.8-flash-tts')[0]).toMatchObject({
      path: '/v1/audio/speech',
      output: 'speech.wav',
    })
    expect(getModelRequests('flux-3-video')[0].path).toBe(
      '/v1/videos/generations'
    )
    expect(getModelRequests('gemini-3.1-flash-tts-preview')).toEqual([])
  })

  it('generates Gemini REST examples that explicitly use this service and an API-key header', () => {
    const requests = getModelRequests('gemini-4-barium', {
      gemini: { path: '/v1beta/models/{model}:generateContent' },
    })
    const request = requests.find((item) => item.auth === 'gemini')
    if (!request) throw new Error('The Gemini example is missing')
    for (const lang of [
      'curl',
      'python',
      'typescript',
      'javascript',
    ] as const) {
      const sample = buildRequestSample(
        lang,
        request,
        'https://www.keyoapi.xyz'
      )
      expect(sample).toContain(
        'https://www.keyoapi.xyz/v1beta/models/gemini-4-barium:generateContent'
      )
      expect(sample).toContain('x-goog-api-key')
      expect(sample).toContain('NEW_API_KEY')
      expect(sample).not.toContain('generativeai')
    }
  })

  it('generates multipart examples without a manual multipart content type', () => {
    for (const lang of [
      'curl',
      'python',
      'typescript',
      'javascript',
    ] as const) {
      const sample = buildRequestSample(
        lang,
        getModelRequests('whisper-large-v3')[0],
        'https://www.keyoapi.xyz'
      )
      expect(sample).toContain('/v1/audio/transcriptions')
      expect(sample).toContain('sample.wav')
      expect(sample).not.toContain('multipart/form-data')
      expect(sample).not.toContain('application/json')
    }
  })
})
