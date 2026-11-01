import { StrictMode, Component, type ReactNode, type ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ── Error Boundary global ────────────────────────────────────────────
interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

class GlobalErrorBoundary extends Component<Props, State> {
  props: Props;
  state: State = { hasError: false, error: null };

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('❌ Error no capturado en la app:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', padding: '2rem',
          fontFamily: 'system-ui, sans-serif', textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            Algo salió mal
          </h1>
          <p style={{ color: '#666', maxWidth: '400px', marginBottom: '1rem' }}>
            Ocurrió un error inesperado. Intentá recargar la página.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 1.5rem', fontSize: '1rem',
              background: '#2563eb', color: '#fff', border: 'none',
              borderRadius: '8px', cursor: 'pointer'
            }}
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// El service worker lo registra vite-plugin-pwa (injectRegister: 'script').
// Registrarlo también acá lo hacía por duplicado.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
);
