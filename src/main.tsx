import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { StoreProvider } from './state/store';
import { repository } from './storage';
import './styles.css';
import { applySavedAppearance } from './platform/theme';
import { AdminPage } from './screens/AdminPage';

applySavedAppearance();

/** 주소가 #admin이면 앱 대신 관리자 페이지를 연다 (앱 안에는 들어가는 버튼이 없다) */
const isAdmin = () => location.hash === '#admin';
const admin = isAdmin();
window.addEventListener('hashchange', () => { if (isAdmin() !== admin) location.reload(); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {admin ? <AdminPage /> : (
      <StoreProvider repo={repository}>
        <App />
      </StoreProvider>
    )}
  </StrictMode>,
);
