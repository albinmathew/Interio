import { Compass, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useDocumentTitle } from '../lib/shell';
import { EmptyState } from '../ui';
import { Logo } from './Dashboard';

const linkButton = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors';

/** A full page with the app header, for places that have nothing else to show. */
function MessagePage({ title, tab, icon, body, testId, children }: { title: string; tab: string; icon: ReactNode; body: ReactNode; testId: string; children?: ReactNode }) {
  useDocumentTitle(tab);
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-line bg-surface px-5">
        <Logo />
      </header>
      <main className="min-h-0 flex-1" data-testid={testId}>
        <EmptyState
          icon={icon}
          title={title}
          body={body}
          action={
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <Link to="/" className={`${linkButton} bg-accent text-white hover:bg-accent-strong`}>
                Back to your homes
              </Link>
              {children}
            </div>
          }
        />
      </main>
    </div>
  );
}

/** Shown for any address the app does not know. */
export function NotFound() {
  const { pathname } = useLocation();
  return (
    <MessagePage
      title="This page does not exist"
      tab="Page not found"
      testId="not-found"
      icon={<Compass className="h-8 w-8" />}
      body={
        <>
          There is nothing at <span className="font-mono text-[13px] break-all text-ink">{pathname}</span>. The link may be mistyped or out of date.
        </>
      }
    >
      <Link to="/import" className={`${linkButton} border border-line bg-surface text-ink hover:bg-sunken`}>
        Upload a floor plan
      </Link>
    </MessagePage>
  );
}

/** Shown when a project address points at a project this browser does not have. */
export function ProjectNotFound() {
  return (
    <MessagePage
      title="Project not found"
      tab="Project not found"
      testId="project-not-found"
      icon={<SearchX className="h-8 w-8" />}
      body="This browser has no project at this address. Projects are stored in the browser that made them: it may have been deleted here, or made on another computer. An exported project file opens from your homes with Open file."
    />
  );
}
