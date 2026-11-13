/**
 * Opens a stored photo in a new tab. The tab is opened straight away, while the tap is still counted, and pointed at the
 * link once it is ready: phones block a tab that is only opened after waiting for the network.
 * Returns false (and closes the empty tab) when no link could be made, for example when offline.
 */
export async function openSigned(getUrl: () => PromiseLike<string | null | undefined>): Promise<boolean> {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  let url: string | null | undefined = null;
  try { url = await getUrl(); } catch { url = null; }
  if (!url) { tab?.close(); return false; }
  if (tab) tab.location.href = url; else window.location.href = url;
  return true;
}
