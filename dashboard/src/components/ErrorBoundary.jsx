import { Component } from 'react'

export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#0a0a0a',
            color: '#f97316',
            padding: 24,
            fontFamily: 'monospace',
            overflow: 'auto',
          }}
        >
          <h1 style={{ fontSize: 18, marginBottom: 16 }}>Something went wrong</h1>
          <pre
            style={{
              background: '#1a1a1a',
              padding: 16,
              borderRadius: 8,
              color: '#ef4444',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {this.state.error?.message}
          </pre>
          {this.state.error?.stack && (
            <pre
              style={{
                background: '#141414',
                padding: 16,
                marginTop: 12,
                fontSize: 12,
                color: '#a3a3a3',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.stack}
            </pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
