import { createRoot } from 'react-dom/client';
import { initSentry } from './services/sentry';
import { AuthProvider } from './contexts/AuthContext';
import { WalletProvider } from './contexts/WalletContext';
import { I18nProvider } from './i18n/index.jsx';
import './index.css';
import App from './App.jsx';

initSentry();

createRoot(document.getElementById('root')).render(
  <I18nProvider>
    <AuthProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </AuthProvider>
  </I18nProvider>,
);
