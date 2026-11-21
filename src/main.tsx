import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { StoreProvider } from './state/store';
import { repository } from './storage';
import './styles.css';
import { applySavedAppearance } from './platform/theme';
import { AdminPage } from './screens/AdminPage';
import { takeLoginReturn } from './platform/login';

applySavedAppearance();

// 브라우저에 이 앱 저장소를 함부로 비우지 말아 달라고 부탁한다 (저장 공간이 모자랄 때 먼저 지우는 대상에서 빠진다).
// 홈 화면에 추가한 앱이면 대개 바로 허락된다. 거절돼도 앱은 그대로 쓴다
void navigator.storage?.persist?.().catch(() => false);

/** 주소가 #admin이면 앱 대신 관리자 페이지를 연다 (앱 안에는 들어가는 버튼이 없다) */
const isAdmin = () => location.hash === '#admin';
const admin = isAdmin();
window.addEventListener('hashchange', () => { if (isAdmin() !== admin) location.reload(); });

// 카카오·구글 로그인 화면에서 돌아왔으면, 화면을 그리기 전에 주소를 원래 탭으로 돌려놓고 결과만 넘긴다
const loginReturn = admin ? null : takeLoginReturn();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {admin ? <AdminPage /> : (
      <StoreProvider repo={repository}>
        <App loginReturn={loginReturn} />
      </StoreProvider>
    )}
  </StrictMode>,
);
