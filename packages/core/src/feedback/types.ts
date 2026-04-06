export type LessonSource = 'assertion' | 'edit' | 'manual';

export interface Lesson {
  /** Unique ID: "lsn_" + nanoid(12) */
  id: string;

  /** Where this lesson came from */
  source: LessonSource;

  /** Human-readable lesson text for the LLM */
  signal: string;

  /** Which constraint failure produced this lesson (if source=assertion) */
  constraint_id?: string;

  /** Which leaf this lesson belongs to */
  leaf_id: string;

  /** ISO8601 timestamp */
  created_at: string;
}
