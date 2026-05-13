import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { EditorPage } from './pages/EditorPage';
import { ViewerPage } from './pages/ViewerPage';
import { SettingsPage } from './pages/SettingsPage';
import { VariablesPage } from './pages/VariablesPage';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/variables" element={<VariablesPage />} />
        <Route path="/edit/:dashboardId" element={<EditorPage />} />
        <Route path="/view/:dashboardId" element={<ViewerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
