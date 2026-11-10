/**
 * Plan mode. Baseline: a read-only drawing of the plan.
 * The 2D editor workstream replaces this with the full editor.
 */
import { useLevel } from '@interio/core';
import { PencilRuler } from 'lucide-react';
import { PlanSvg } from '../../lib/PlanSvg';
import { EmptyState } from '../../ui';

export default function Editor2D() {
  const level = useLevel();
  if (!level) return null;
  if (Object.keys(level.walls).length === 0)
    return <EmptyState icon={<PencilRuler className="h-8 w-8" />} title="Empty plan" body="Wall drawing tools arrive with the plan editor." />;
  return (
    <div className="h-full w-full bg-canvas p-6">
      <PlanSvg level={level} className="h-full w-full" />
    </div>
  );
}
