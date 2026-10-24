/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createInstance } from 'i18next'
import { describe, expect, test, vi } from 'vitest'
import { lazyLocaleBackend, resources } from '../config'

const requests = vi.hoisted(() => [] as string[])

vi.mock('../locales/fr.json', () => {
  requests.push('fr')
  return { default: { translation: { 'Sign in': 'Se connecter' } } }
})
vi.mock('../locales/ja.json', () => {
  requests.push('ja')
  throw new Error('Offline locale chunk')
})

describe('interface translation loading', () => {
  test('an English first visit does not download unused language dictionaries', async () => {
    const instance = createInstance().use(lazyLocaleBackend)
    await instance.init({
      resources,
      lng: 'en',
      fallbackLng: 'en',
      partialBundledLanguages: true,
    })

    expect(instance.t('Sign in')).toBe('Sign in')
    expect(requests).toEqual([])

    await instance.changeLanguage('fr')
    expect(instance.t('Sign in')).toBe('Se connecter')
    expect(requests).toEqual(['fr'])
  })

  test('a language chunk failure leaves the English form readable', async () => {
    const instance = createInstance().use(lazyLocaleBackend)
    await instance.init({
      resources,
      lng: 'en',
      fallbackLng: 'en',
      partialBundledLanguages: true,
    })

    await instance.changeLanguage('ja')

    expect(instance.t('Sign in')).toBe('Sign in')
    expect(instance.isInitialized).toBe(true)
  })
})
