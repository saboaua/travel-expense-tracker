/**
 * The small Google Apps Script a person pastes into script.google.com once. It runs inside their own Gmail, every few minutes:
 * asks the app which senders are allowed, finds new mail from them, and posts each email (text, first PDF and Gmail's own
 * "Authentication-Results" line) to the app with the person's private key. The key is the only secret in it.
 */
export function gmailScript(key: string, endpoint: string): string {
  return `// Lifolio bill emails. Your private key is in this script: keep it to yourself.
const KEY = ${JSON.stringify(key)};
const ENDPOINT = ${JSON.stringify(endpoint)};

function sendBills() {
  const got = UrlFetchApp.fetch(ENDPOINT, { headers: { "x-bill-key": KEY }, muteHttpExceptions: true });
  if (got.getResponseCode() !== 200) return;
  const senders = (JSON.parse(got.getContentText()).senders || []).filter(function (s) { return /^[^\\s@()]+@[^\\s@()]+$/.test(s); });
  if (!senders.length) return;
  const props = PropertiesService.getScriptProperties();
  const done = JSON.parse(props.getProperty("done") || "[]");
  GmailApp.search("from:(" + senders.join(" OR ") + ") newer_than:3d", 0, 30).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      const id = m.getId();
      if (done.indexOf(id) >= 0) return;
      let auth = "";
      try {
        const head = m.getRawContent().split(/\\r?\\n\\r?\\n/)[0].replace(/\\r?\\n[ \\t]+/g, " ");
        auth = (head.match(/^Authentication-Results:\\s*mx\\.google\\.com[^\\n]*/im) || [""])[0];
      } catch (e) {}
      let pdf = null;
      m.getAttachments().forEach(function (a) {
        if (!pdf && /pdf/i.test(a.getContentType()) && a.getSize() <= 4000000) {
          pdf = { Name: a.getName(), ContentType: "application/pdf", Content: Utilities.base64Encode(a.getBytes()), ContentLength: a.getSize() };
        }
      });
      const res = UrlFetchApp.fetch(ENDPOINT, {
        method: "post", contentType: "application/json", headers: { "x-bill-key": KEY }, muteHttpExceptions: true,
        payload: JSON.stringify({ From: m.getFrom(), Subject: m.getSubject(), Date: m.getDate().toISOString(), MessageID: id, TextBody: m.getPlainBody().slice(0, 60000), Auth: auth, Attachments: pdf ? [pdf] : [] })
      });
      if (res.getResponseCode() === 200) done.push(id);
    });
  });
  props.setProperty("done", JSON.stringify(done.slice(-300)));
}
`;
}
