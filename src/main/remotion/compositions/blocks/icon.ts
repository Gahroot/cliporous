import { icons, HelpCircle, type LucideIcon } from 'lucide-react'

/**
 * Resolve a Lucide icon by its PascalCase name, with a safe fallback.
 * Mirrors the inline resolver in IconRow.tsx so icon names can be passed as
 * plain (JSON-serializable) string props.
 */
export const resolveIcon = (name: string): LucideIcon =>
  (icons as Record<string, LucideIcon>)[name] ?? HelpCircle
