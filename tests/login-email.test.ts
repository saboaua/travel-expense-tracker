import { loginEmail, APP_LINK } from "../src/lib/login-email";
import { emailConfigured, emailProvider, sendEmail } from "../src/lib/email";

let fail = 0;
const eq = (m: string, a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.error(`FAIL ${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); } };

const m = loginEmail({ email: "maria@example.com", firstName: "Maria", password: "Kd7-mQ2x-Pf9", expiresAt: "2026-11-15T15:45:00Z" });
eq("subject", m.subject, "Your Lifolio login");
eq("text has the login", [m.text.includes(APP_LINK), m.text.includes("User: maria@example.com"), m.text.includes("Temp password: Kd7-mQ2x-Pf9"), m.text.includes("24 hours"), m.text.startsWith("Hi Maria,")], [true, true, true, true, true]);
eq("html has the password", m.html.includes("Kd7-mQ2x-Pf9"), true);
eq("no name", loginEmail({ email: "a@b.co", password: "x", expiresAt: "2026-11-15T15:45:00Z" }).text.startsWith("Hi,\n"), true);
eq("reset wording", loginEmail({ email: "a@b.co", password: "x", expiresAt: "2026-11-15T15:45:00Z", reset: true }).subject, "Your new Lifolio password");
// names and emails are escaped in the HTML
eq("escaped", loginEmail({ email: "a@b.co", firstName: "<b>x</b>", password: "p", expiresAt: "2026-11-15T15:45:00Z" }).html.includes("<b>x</b>"), false);

// not set up: nothing is sent
delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
eq("not configured", emailConfigured(), false);
sendEmail({ to: "a@b.co", subject: "s", html: "h", text: "t" }).then((r) => {
  eq("refuses without a key", r.ok, false);
  process.env.RESEND_API_KEY = "k"; process.env.EMAIL_FROM = "Lifolio <l@x.co>";
  eq("configured", [emailConfigured(), emailProvider()], [true, "resend"]);
  process.env.GMAIL_USER = "a@gmail.com"; process.env.GMAIL_APP_PASSWORD = "pw";
  eq("gmail wins when both are set", emailProvider(), "gmail");
  delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
  eq("gmail alone is enough", [emailConfigured(), emailProvider()], [true, "gmail"]);
  delete process.env.GMAIL_APP_PASSWORD;
  eq("half set is off", [emailConfigured(), emailProvider()], [false, null]);
  if (fail) process.exit(1);
  console.log("login-email OK");
});
