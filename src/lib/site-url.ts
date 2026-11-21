/** The app's web address, with a closing slash. NEXT_PUBLIC_SITE_URL overrides it (set it in Vercel if the address changes again). */
export const SITE_URL = `${(process.env.NEXT_PUBLIC_SITE_URL || "https://vifolio-woad.vercel.app").replace(/\/+$/, "")}/`;
