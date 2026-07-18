export type MatchedBlockDispositionLike = {
  disposition: string;
};

export declare const requireCompleteBlockDisposition: <
  T extends MatchedBlockDispositionLike
>(
  disposition: T | null | undefined,
  blockId: string
) => T;
