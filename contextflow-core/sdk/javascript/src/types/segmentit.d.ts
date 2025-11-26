declare module "segmentit" {
  export type SegmentToken =
    | string
    | {
        w: string;
        [key: string]: unknown;
      };

  export class Segment {
    constructor(options?: Record<string, unknown>);
    use(plugin: unknown): void;
    loadDict(dict: unknown): void;
    doSegment(text: string, options?: Record<string, unknown>): SegmentToken[];
  }

  export function useDefault(segment: Segment): Segment;
}
