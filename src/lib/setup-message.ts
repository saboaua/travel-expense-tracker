/** The message shown when a database step has not been run yet: what is missing and exactly what to do. */
export const setupNeeded = (what: string, file: string) => `${what} is not set up yet. Run supabase/${file} in the Supabase SQL Editor, then reload this page.`;
