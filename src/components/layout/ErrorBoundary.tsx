import { Component, type ReactNode } from 'react'
import { FiAlertTriangle } from 'react-icons/fi'
import i18n from '@/i18n'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

function reportClientError(error: Error, errorInfo: React.ErrorInfo): void {
  try {
    const payload = {
      message: error.message,
      stack: error.stack?.slice(0, 1000),
      componentStack: errorInfo.componentStack?.slice(0, 1000),
      url: window.location.href,
      userAgent: navigator.userAgent,
    }
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      navigator.sendBeacon('/api/client-error', blob)
    } else {
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // 上报失败不影响用户
  }
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
    reportClientError(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background-secondary px-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <FiAlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {i18n.t('errorBoundary.title', '页面出现错误')}
            </h2>
            <p className="text-sm text-foreground-muted mb-6">
              {i18n.t('errorBoundary.message', '很抱歉，应用遇到了意外问题。您可以尝试刷新页面恢复。')}
            </p>
            {this.state.error && import.meta.env.DEV && (
              <div className="mb-6 p-3 bg-gray-50 rounded-lg text-left">
                <p className="text-xs text-foreground-subtle font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="w-full px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {i18n.t('errorBoundary.refresh', '刷新页面')}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
