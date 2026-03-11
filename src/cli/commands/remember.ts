export const runRememberCommand = (rule?: string): void => {
  if (!rule) {
    console.log('Usage: ee remember "<rule>"');
    return;
  }

  console.log(`Remember command scaffolded: ${rule}`);
};

