import React from 'react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryState {
  error: Error | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

/**
 * Top-level renderer error boundary.
 *
 * Catches any thrown render error from the entire app tree and shows a
 * minimal recovery surface (message + reload). Lives at the very root so
 * the Toaster, AlertDialog, and screen router are all inside it.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-background p-8">
          <div className="flex max-w-md flex-col gap-4">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-muted-foreground text-sm">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
            <div>
              <Button onClick={this.handleReload}>Reload</Button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
