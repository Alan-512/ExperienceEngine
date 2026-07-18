export const requireCompleteBlockDisposition = (disposition, blockId) => {
  if (!disposition || disposition.disposition !== "complete") {
    throw new Error(`Block ${blockId} lacks a complete disposition.`);
  }
  return disposition;
};
