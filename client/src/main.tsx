import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { EditorPage } from './pages/EditorPage';
import { ViewerPage } from './pages/ViewerPage';
import { SettingsPage } from './pages/SettingsPage';
import { VariablesPage } from './pages/VariablesPage';
import { TallyHubPage } from './pages/TallyHubPage';
import { TallyViewerPage } from './pages/TallyViewerPage';
import { LoginModal } from './components/AuthBar';
import { useAuthStatus } from './lib/auth';
import './styles.css';

/**
 * Edit-route gate. When auth is enabled and the user isn't
 * authenticated, /edit/:id redirects to /view/:id. Direct deep-link
 * from a phone/tablet without a PIN gets the safe read-only view
 * instead of a stripped-down editor.
 *
 * While auth status is still loading (very brief, ~1 frame after
 * mount) we render nothing rather than flash the editor.
 */
function EditorGate() {
  const { dashboardId = '' } = useParams();
  const auth = useAuthStatus();
  if (auth.enabled && !auth.authenticated) {
    return <Navigate to={`/view/${dashboardId}`} replace />;
  }
  return <EditorPage />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/variables" element={<VariablesPage />} />
        <Route path="/tally" element={<TallyHubPage />} />
        <Route path="/tally/:slug" element={<TallyViewerPage />} />
        <Route path="/edit/:dashboardId" element={<EditorGate />} />
        <Route path="/view/:dashboardId" element={<ViewerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* Global login modal - listens for auth.openLoginModal() calls */}
      <LoginModal />
    </BrowserRouter>
  </React.StrictMode>
);
