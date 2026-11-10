import { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ImportFeature } from './features/registry';
import { Dashboard, Logo } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';
import { Workspace } from './pages/Workspace';
import { Button, EmptyState, ErrorBoundary, Spinner, Toaster } from './ui';

const Loading = () => (
  <div className="flex h-full items-center justify-center">
    <Spinner className="h-6 w-6" />
  </div>
);

/** Last line of defence: a crash outside a workspace mode (dashboard, import, the shell itself). */
function PageCrash({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col" role="alert" data-testid="page-error">
      <header className="flex h-14 shrink-0 items-center border-b border-line bg-surface px-5">
        <Logo />
      </header>
      <EmptyState
        title="Something went wrong"
        body={
          <>
            This page hit a problem and could not be shown. Your homes are saved in this browser and are not affected.
            <span className="mt-2 block font-mono text-xs break-words text-ink-faint">{error.message}</span>
          </>
        }
        action={
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={onRetry}>
              Try again
            </Button>
            {/* A full page load, so whatever state caused the crash is dropped. */}
            <a href="/" className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-ink hover:bg-sunken">
              Back to your homes
            </a>
          </div>
        }
      />
    </div>
  );
}

function Pages() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname} onError={(error) => console.error('Page crashed', error)} fallback={(error, reset) => <PageCrash error={error} onRetry={reset} />}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/import" element={<ImportFeature />} />
          <Route path="/p/:projectId" element={<Navigate to="design" replace />} />
          <Route path="/p/:projectId/:mode" element={<Workspace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Pages />
      <Toaster />
    </BrowserRouter>
  );
}
