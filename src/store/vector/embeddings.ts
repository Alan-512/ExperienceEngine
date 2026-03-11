export const embedText = async (value: string): Promise<number[]> => {
  const tokens = value.toLowerCase().split(/\W+/).filter(Boolean);
  return [tokens.length, value.length];
};

