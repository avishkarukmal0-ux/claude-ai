import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
    // Record it (metadata only — no shop data) so it shows in Help & diagnostics.
    try {
      const code = (error?.message || 'render error').slice(0, 80);
      window.dispatchEvent(new CustomEvent('vendora:storage-error', { detail: { error: code, kind: 'render' } }));
    } catch { /* non-browser */ }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    try { this.props.onReset?.(); } catch { /* ignore */ }
  };

  render() {
    if (this.state.hasError) {
      const hasReset = typeof this.props.onReset === 'function';
      return (
        <div style={{
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 300,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Something went wrong loading this page
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, maxWidth: 400 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 20, maxWidth: 400 }}>
            Your saved data is safe — this only affected the screen.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '8px 20px',
              background: 'var(--blue)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {hasReset ? 'Back to home' : 'Try Again'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
