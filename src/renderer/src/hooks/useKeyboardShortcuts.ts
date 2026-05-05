import { useEffect } from 'react'

/**
 * Returns true if the active element is a text input, textarea, or contenteditable.
 * Keyboard shortcuts should not fire when the user is typing.
 */
function isTyping(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

/**
 * Returns true if a modal dialog is currently open (settings, help, etc.).
 * Global shortcuts should defer to the dialog's own shortcut handler.
 */
function isDialogOpen(): boolean {
  return document.querySelectorAll('[role="dialog"][data-state="open"]').length > 0
}

export interface KeyboardShortcutCallbacks {
  onSave: () => void
  onLoad: () => void
  onOpenSettings: () => void
  onShowHelp: () => void
}

/**
 * Global app shortcuts — trimmed to the four supported actions:
 *
 * - Cmd/Ctrl+S → save project
 * - Cmd/Ctrl+O → open project
 * - Cmd/Ctrl+, → settings
 * - ?          → help
 */
export function useKeyboardShortcuts(callbacks: KeyboardShortcutCallbacks): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey

      // --- Modifier shortcuts (work even when typing) ---

      // Cmd/Ctrl+S — save project
      if (mod && e.key === 's' && !e.shiftKey) {
        e.preventDefault()
        callbacks.onSave()
        return
      }

      // Cmd/Ctrl+O — load project
      if (mod && e.key === 'o') {
        e.preventDefault()
        callbacks.onLoad()
        return
      }

      // Cmd/Ctrl+, — open settings
      if (mod && e.key === ',') {
        e.preventDefault()
        callbacks.onOpenSettings()
        return
      }

      // --- Non-modifier shortcuts: skip if user is typing or dialog is open ---
      if (isTyping()) return
      if (isDialogOpen()) return

      // ? — help dialog
      if (e.key === '?') {
        e.preventDefault()
        callbacks.onShowHelp()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [callbacks])
}
