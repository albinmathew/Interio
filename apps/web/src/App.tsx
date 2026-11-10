import { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ImportFeature } from './features/registry';
import { Dashboard } from './pages/Dashboard';
import { Workspace } from './pages/Workspace';
import { Spinner, Toaster } from './ui';

const Loading = () => (
  <div className="flex h-full items-center justify-center">
    <Spinner className="h-6 w-6" />
  </div>
);

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/import" element={<ImportFeature />} />
          <Route path="/p/:projectId" element={<Navigate to="design" replace />} />
          <Route path="/p/:projectId/:mode" element={<Workspace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  );
}
