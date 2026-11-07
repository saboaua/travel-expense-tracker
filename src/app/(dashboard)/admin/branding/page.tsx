"use client";

import { Alert } from "@/components/ui/alert";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccordionGroup, AccordionSection } from "@/components/ui/accordion";
import { Palette, Upload, ImageIcon, Plane, FileText, User } from "lucide-react";
import { BRANDING_COLS, BRANDING_COLS_BASE, withColumnFallback } from "@/lib/columns";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Save failed";
}

export default function AdminBrandingPage() {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [appName, setAppName] = useState("Travel Expense Tracker");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#4f46e5");
  const [logoSize, setLogoSize] = useState(56);
  const [privacyPolicy, setPrivacyPolicy] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [personalEnabled, setPersonalEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // The later columns need migrations; without them the page still loads the name, logo and color.
      const { data: row } = await withColumnFallback(
        (cols) => supabase.from("app_settings").select(cols).eq("id", 1).single(),
        BRANDING_COLS,
        BRANDING_COLS_BASE
      );

      const data = row as unknown as { app_name?: string | null; logo_url?: string | null; primary_color?: string | null; login_logo_size?: number | null; privacy_policy?: string | null; support_email?: string | null; personal_enabled?: boolean | null } | null;
      if (data) {
        setAppName(data.app_name || "Travel Expense Tracker");
        setLogoUrl(data.logo_url ?? null);
        setPrimaryColor(data.primary_color || "#4f46e5");
        setLogoSize(data.login_logo_size || 56);
        setPrivacyPolicy(data.privacy_policy || "");
        setSupportEmail(data.support_email || "");
        setPersonalEnabled(data.personal_enabled !== false);
      }
    }
    load();
  }, [supabase]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `logo.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true, cacheControl: "3600" });

      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("branding").getPublicUrl(path);

      const url = `${publicUrl}?t=${Date.now()}`;
      setLogoUrl(url);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Not signed in");

      // Prefer update (row is created by migration). Fall back to insert if missing.
      const { data: existing } = await supabase
        .from("app_settings")
        .select("id")
        .eq("id", 1)
        .maybeSingle();

      const payload = {
        app_name: appName,
        logo_url: logoUrl,
        primary_color: primaryColor,
        login_logo_size: logoSize,
        privacy_policy: privacyPolicy.trim() || null,
        support_email: supportEmail.trim() || null,
        personal_enabled: personalEnabled,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };

      const { error: err } = existing
        ? await supabase.from("app_settings").update(payload).eq("id", 1)
        : await supabase.from("app_settings").insert({ id: 1, ...payload });

      if (err) throw err;

      document.documentElement.style.setProperty("--brand-primary", primaryColor);

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      setError(
        /column|schema cache/i.test(msg)
          ? `${msg}. Run supabase/migration_login_support.sql in the Supabase SQL Editor, then try again.`
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Palette className="h-7 w-7" />
          Branding
        </h1>
        <p className="text-muted-foreground mt-1">
          Logo and colors shown on login and in the app header
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
      <AccordionGroup>
      <AccordionSection id="logo" title="Logo" icon={<ImageIcon />} summary={logoUrl ? `Custom logo · ${logoSize}px on the login screen` : "Default logo"} description="Appears on the login screen and next to the app name in the sidebar">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-xl border bg-muted flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading..." : "Upload logo"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG, SVG or WebP. Wide logos are fine. The home screen icon is made from this logo on a white square. iPhones copy the icon only when the app is added, so people who already installed it are told in the app how to refresh it.
              </p>
            </div>
          </div>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <label htmlFor="logo-size" className="text-sm font-medium">
                Login screen logo size
              </label>
              <span className="text-sm text-muted-foreground tabular-nums">{logoSize}px</span>
            </div>
            <input
              id="logo-size"
              type="range"
              min={32}
              max={200}
              step={4}
              value={logoSize}
              onChange={(e) => setLogoSize(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex min-h-[120px] items-center justify-center rounded-xl border bg-slate-50 p-4">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Login logo preview" style={{ height: logoSize, width: "auto", maxWidth: "100%" }} className="object-contain" />
              ) : (
                <div
                  className="flex items-center justify-center rounded-xl"
                  style={{ height: logoSize, width: logoSize, backgroundColor: primaryColor }}
                >
                  <Plane className="text-white" style={{ height: logoSize * 0.5, width: logoSize * 0.5 }} />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Height of the logo on the login screen (32 to 200 px). Width follows the image.</p>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection id="name-color" title="App name & color" icon={<Palette />} summary={`${appName || "No name"} · ${primaryColor}`}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">App name</label>
              <Input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="Travel Expense Tracker"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Primary color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#4f46e5"
                  className="font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Used for buttons and highlights (login + app)
              </p>
            </div>

            <div className="rounded-xl border p-4 bg-slate-50">
              <p className="text-xs text-muted-foreground mb-2">Preview</p>
              <div className="flex items-center gap-2">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-8 w-8 object-contain rounded" />
                ) : (
                  <div
                    className="h-8 w-8 rounded-xl flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: primaryColor }}
                  >
                    TE
                  </div>
                )}
                <span className="font-semibold">{appName}</span>
              </div>
              <button
                type="button"
                className="mt-3 h-9 px-4 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: primaryColor }}
              >
                Sample button
              </button>
            </div>

          </div>
        </AccordionSection>

      <AccordionSection
        id="privacy"
        title="Privacy policy & support"
        icon={<FileText />}
        summary={[privacyPolicy.trim() ? "Policy published" : "No policy yet", supportEmail.trim()].filter(Boolean).join(" · ")}
        description={<>Shown from the login screen. &quot;Privacy Policy&quot; opens /privacy with the text below, and &quot;Contact Support&quot; opens /contact, a form whose messages appear under Global Settings &rarr; Support Requests.</>}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="privacy" className="text-sm font-medium">
              Privacy policy text
            </label>
            <textarea
              id="privacy"
              value={privacyPolicy}
              onChange={(e) => setPrivacyPolicy(e.target.value)}
              rows={12}
              placeholder="Paste or write your privacy policy here. Line breaks are kept."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">Plain text. Leave empty to show &quot;not published yet&quot;.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="support-email" className="text-sm font-medium">
              Support email
            </label>
            <Input
              id="support-email"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="support@company.com"
            />
            <p className="text-xs text-muted-foreground">
              Shown on the contact page. If the server has a RESEND_API_KEY, new messages are also emailed here.
            </p>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection
        id="personal-section"
        title="Personal section"
        icon={<User />}
        summary={personalEnabled ? "On for everyone" : "Off for everyone"}
        description="Lets each person track their own groceries, home projects and personal trips. That data is private to the user: admins cannot see it. Turn this off to hide the section for everyone."
      >
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={personalEnabled} onChange={(e) => setPersonalEnabled(e.target.checked)} />
            Enable the Personal section
          </label>
        </AccordionSection>
      </AccordionGroup>

      {error && <Alert>{error}</Alert>}
      {saved && (
        <Alert variant="success">
          Branding saved. Refresh the page to see it everywhere.
        </Alert>
      )}

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save branding"}
      </Button>
      </form>
    </div>
  );
}
