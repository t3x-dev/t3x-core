import { useCanvasStore } from '@/store/canvasStore';
import type { MergeCandidate } from '@/types/merge';

interface MergeCandidateListProps {
  candidates: MergeCandidate[];
  side: 'source' | 'target';
  title: string;
}

/**
 * List of unique sentences with keep/discard checkboxes
 * 唯一句子列表，带保留/丢弃复选框
 */
export function MergeCandidateList({ candidates, side, title }: MergeCandidateListProps) {
  const toggleKeep = useCanvasStore((s) => s.toggleKeep);

  if (candidates.length === 0) return null;

  const keptCount = candidates.filter((c) => c.keep).length;

  return (
    <div className="border rounded-lg p-[var(--space-group)]">
      <div className="flex justify-between items-center mb-[var(--space-item)]">
        <h3 className="font-medium">{title}</h3>
        <span className="text-sm text-muted-foreground">
          ({keptCount} / {candidates.length}) keeping
        </span>
      </div>

      <div className="space-y-[var(--space-item)]">
        {candidates.map((candidate, index) => (
          <label key={candidate.sentence.id} className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={candidate.keep}
              onChange={() => toggleKeep(side, index)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className={candidate.keep ? '' : 'text-muted-foreground/70 line-through'}>
                {candidate.sentence.text}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
