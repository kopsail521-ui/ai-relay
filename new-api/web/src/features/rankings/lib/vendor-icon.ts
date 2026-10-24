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
/**
 * Map a plain vendor display name (e.g. "Anthropic", "智谱", "阿里巴巴")
 * to the matching @lobehub/icons component name so ranking rows can render
 * a vendor icon when the API response omits `vendor_icon`.
 */
const VENDOR_ICON_BY_NAME: Record<string, string> = {
  OpenAI: 'OpenAI',
  Anthropic: 'Anthropic',
  Claude: 'Anthropic',
  Google: 'Gemini',
  Gemini: 'Gemini',
  DeepSeek: 'DeepSeek',
  智谱: 'Zhipu',
  Zhipu: 'Zhipu',
  Moonshot: 'Moonshot',
  Kimi: 'Moonshot',
  阿里巴巴: 'Qwen',
  Alibaba: 'Qwen',
  Qwen: 'Qwen',
  xAI: 'Grok',
  XAI: 'Grok',
  Grok: 'Grok',
  MiniMax: 'Minimax',
  字节跳动: 'Doubao',
  Doubao: 'Doubao',
  腾讯: 'Hunyuan',
  百度: 'Wenxin',
  Mistral: 'Mistral',
  Meta: 'Meta',
  Cloudflare: 'Cloudflare',
  ElevenLabs: 'ElevenLabs',
  Suno: 'Suno',
}

export function vendorIconName(
  vendorIcon: string | undefined | null,
  vendor: string | undefined | null
): string | undefined {
  if (vendorIcon && vendorIcon.trim()) return vendorIcon
  if (!vendor) return undefined
  return VENDOR_ICON_BY_NAME[vendor.trim()]
}
