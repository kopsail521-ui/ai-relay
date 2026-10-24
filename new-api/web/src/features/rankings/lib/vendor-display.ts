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
 * Vendor display names come from the database in Chinese for CN vendors
 * (e.g. "智谱", "阿里巴巴"). Non-Chinese UI languages show the
 * internationally recognized brand instead, so a Japanese or English
 * visitor never sees untranslated Chinese vendor names.
 */
const INTERNATIONAL_VENDOR_NAMES: Record<string, string> = {
  智谱: 'Zhipu AI',
  阿里巴巴: 'Alibaba',
  字节跳动: 'ByteDance',
  腾讯: 'Tencent',
  百度: 'Baidu',
  哔哩哔哩: 'Bilibili',
  小米: 'Xiaomi',
  阶跃星辰: 'StepFun',
}

export function localizeVendorName(
  vendor: string | undefined | null,
  language: string
): string {
  if (!vendor) return ''
  if (language.toLowerCase().startsWith('zh')) return vendor
  return INTERNATIONAL_VENDOR_NAMES[vendor] ?? vendor
}
