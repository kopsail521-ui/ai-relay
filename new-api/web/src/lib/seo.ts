/*
Copyright (C) 2023-2026 QuantumNous
*/

export const SITE_ORIGIN = 'https://www.keyoapi.xyz'

export const DEFAULT_SEO = {
  title: 'KeyoAPI - OpenAI-Compatible API Gateway for Multiple AI Models',
  description:
    'Access text, image, speech and multimodal AI models through one OpenAI-compatible API. Use a single endpoint with Python, Node.js, Cursor and other OpenAI SDK clients.',
  ogImage: `${SITE_ORIGIN}/logo.png`,
} as const

export type PageMeta = {
  title?: string
  description?: string
  canonical?: string
  ogImage?: string
  noIndex?: boolean
}

function upsertMeta(name: string, content: string, attr: 'name' | 'property') {
  if (typeof document === 'undefined') return
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  if (typeof document === 'undefined') return
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/** Apply per-route SEO tags. Pass partial meta; unset fields fall back to DEFAULT_SEO. */
export function applyPageMeta(meta: PageMeta = {}) {
  if (typeof document === 'undefined') return

  const title = meta.title ?? DEFAULT_SEO.title
  const description = meta.description ?? DEFAULT_SEO.description
  const ogImage = meta.ogImage ?? DEFAULT_SEO.ogImage
  const canonical =
    meta.canonical ??
    `${SITE_ORIGIN}${window.location.pathname}${window.location.search}`

  document.title = title
  upsertMeta('title', title, 'name')
  upsertMeta('description', description, 'name')
  upsertMeta('og:title', title, 'property')
  upsertMeta('og:description', description, 'property')
  upsertMeta('og:image', ogImage, 'property')
  upsertMeta('og:url', canonical, 'property')
  upsertMeta('og:type', 'website', 'property')
  upsertMeta('twitter:card', 'summary_large_image', 'name')
  upsertMeta('twitter:title', title, 'name')
  upsertMeta('twitter:description', description, 'name')
  upsertLink('canonical', canonical)

  if (meta.noIndex) {
    upsertMeta('robots', 'noindex, nofollow', 'name')
  } else {
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    robots?.remove()
  }
}

/** Store default branding title for fallback (console pages use system name only). */
let defaultBrandingTitle = DEFAULT_SEO.title

export function setDefaultBrandingTitle(name: string) {
  defaultBrandingTitle = name
}

export function getDefaultBrandingTitle() {
  return defaultBrandingTitle
}
