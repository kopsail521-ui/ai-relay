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
import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

/**
 * `/` is a static page rendered directly by Caddy — the App never owns this path
 * on a fresh load. Reaching this component means an in-App soft navigation slipped
 * past the `reloadDocument` links (nav, logos, error pages), so bounce to a full
 * page load to show the real static homepage instead of the stale custom-home view.
 *
 * Invariant: the static homepage must never boot the App's JS — otherwise this
 * redirect would reload-loop. The DEV guard keeps local dev (where the SPA serves
 * `/` itself) on the in-App home.
 */
function RedirectToStaticHome() {
  useEffect(() => {
    if (!import.meta.env.DEV) {
      window.location.replace(window.location.href)
    }
  }, [])

  return null
}

export const Route = createFileRoute('/')({
  component: RedirectToStaticHome,
})
