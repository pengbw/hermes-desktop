import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  title?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{ padding: 20, color: "#e17055", textAlign: "center" }}>
          <p>{this.props.title ?? "组件加载失败"}</p>
          <p style={{ fontSize: 12, color: "#999" }}>{this.state.error?.message}</p>
          <button
            style={{ marginTop: 8, padding: "4px 12px", cursor: "pointer" }}
            onClick={this.handleRetry}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
