import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from './reporting'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Top-level render crash guard (#240). Before this, any uncaught render-time
 * exception (a bad engine state, a bug in a screen component, …) left the
 * player on a permanent white screen with no way back short of force-quitting.
 * Catches synchronous render/lifecycle errors in the subtree below it — not
 * errors thrown from event handlers or async callbacks, which is why
 * `handleAction` in App.tsx has its own try/catch around `applyActionWithOutcome`
 * — and offers a reload instead.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack)
    // React re-throws render errors it hands to a boundary as *handled*, so
    // Sentry's global handlers never see this crash — report it here (#252).
    reportError(error, { componentStack: info.componentStack ?? undefined })
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h1>Something went wrong</h1>
          <p>{this.state.error.message}</p>
          <button className="primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
