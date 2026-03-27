/**
 * ErrorBoundary — catches React render errors and shows fallback UI
 * instead of a blank screen.
 */

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div style={{
          padding: '32px',
          margin: '24px',
          background: '#fcebeb',
          border: '1px solid #e24b4a',
          borderRadius: '12px',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <h2 style={{ fontSize: '18px', color: '#791f1f', marginBottom: '8px' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '13px', color: '#a32d2d', marginBottom: '12px' }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 16px',
              background: '#e24b4a',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
