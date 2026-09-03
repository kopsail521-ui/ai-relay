/*
Copyright (C) 2023-2026 QuantumNous
*/
import { toast } from 'sonner'

/** Toast + scroll/highlight the privacy/terms checkbox when OAuth is blocked. */
export function remindLegalConsent(message: string) {
  toast.error(message)

  const box =
    document.getElementById('legal-consent-box') ||
    document.getElementById('legal-consent')
  if (!box) return

  box.scrollIntoView({ behavior: 'smooth', block: 'center' })
  box.classList.add('ring-2', 'ring-destructive', 'ring-offset-2')
  window.setTimeout(() => {
    box.classList.remove('ring-2', 'ring-destructive', 'ring-offset-2')
  }, 2200)
}
