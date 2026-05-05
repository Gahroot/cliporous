import { useEffect } from 'react'

/**
 * Theme is locked to dark in batchclip.
 *
 * Ensures the `dark` class is always present on `<html>` so Tailwind's
 * `dark:` variants apply. Runs once on mount — no toggle, no system listener.
 */
export function useTheme(): void {
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])
}
