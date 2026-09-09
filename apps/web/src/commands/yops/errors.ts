/** Typed failure for replaying historical conversation YOps evidence. */

import { CommandError } from '../CommandError';

export class YOpsReplayError extends CommandError {
  constructor(
    public opIndex: number,
    public opError: string,
    message?: string
  ) {
    super('yops_replay', message ?? `replay failed at op ${opIndex}: ${opError}`);
    this.name = 'YOpsReplayError';
  }
}
