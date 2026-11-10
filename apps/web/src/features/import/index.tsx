/**
 * Import flow at /import. Baseline: pick a PDF and run the importer.
 * The importer workstream builds the full wizard (layer roles, scale, review).
 */
import { importPdf, ImportError } from '@interio/importer';
import { FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createFromDraft } from '../../lib/session';
import { Logo } from '../../pages/Dashboard';
import { Button, Panel, Spinner } from '../../ui';

export default function ImportPage() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const draft = await importPdf(await file.arrayBuffer(), { fileName: file.name });
      const project = await createFromDraft(draft, file.name.replace(/\.pdf$/i, ''), file);
      navigate(`/p/${project.id}/plan`);
    } catch (e) {
      setError(e instanceof ImportError || e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full">
      <header className="flex h-14 items-center border-b border-line bg-surface px-5">
        <Logo />
      </header>
      <main className="mx-auto max-w-xl px-5 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Upload a floor plan</h1>
        <p className="mt-1 text-sm text-ink-soft">A PDF from your builder or architect works best.</p>
        <Panel className="mt-6 flex flex-col items-center gap-3 p-10 text-center">
          <FileUp className="h-8 w-8 text-ink-faint" />
          <Button variant="primary" disabled={busy} icon={busy ? <Spinner className="text-white" /> : undefined} onClick={() => input.current?.click()}>
            Choose PDF
          </Button>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            data-testid="pdf-input"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (file) void run(file);
            }}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </Panel>
      </main>
    </div>
  );
}
