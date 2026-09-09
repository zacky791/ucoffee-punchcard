import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <section className="page" style={{ padding: '2rem 1.25rem' }}>
          <h1>Something went wrong</h1>
          <p className="banner error">
            {this.state.error?.message || 'Unexpected UI error'}
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
