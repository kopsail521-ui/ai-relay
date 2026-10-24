/*
Copyright (C) 2023-2026 QuantumNous
*/
import { afterEach, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { bootstrapAuthentication } from '../auth-session'

const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')

afterEach(() => {
  vi.useRealTimers()
  useAuthStore.getState().auth.reset('idle')
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks)
  else Reflect.deleteProperty(navigator, 'locks')
})

test('another tab holding the refresh lock cannot leave initial navigation pending forever', async () => {
  vi.useFakeTimers()
  useAuthStore.getState().auth.reset('idle')
  const request = vi.fn(
    (_name: string, options: LockOptions) =>
      new Promise<never>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new DOMException('Lock wait aborted', 'AbortError'))
        })
      })
  )
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request },
  })

  const pending = bootstrapAuthentication()
  expect(request.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal)
  await vi.advanceTimersByTimeAsync(3000)

  expect((await pending).kind).toBe('transient_error')
  expect(useAuthStore.getState().auth.bootstrapState).toBe('idle')
})
