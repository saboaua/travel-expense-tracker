"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Palette, Upload, ImageIcon } from "lucide-react";

export default function AdminBrandingPage() {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [appName, setAppName] = useState("Travel Expense Tracker");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#4f46e5");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (data) {
        setAppName(data.app_name || "Travel Expense Tracker");
        setLogoUrl(data.logo_url);
        setPrimaryColor(data.primary_color || "#4f46e5");
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
      setError(err instanceof Error ? err.message : "Upload failed");
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

      const { error: err } = await supabase.from("app_settings").upsert({
        id: 1,
        app_name: appName,
        logo_url: logoUrl,
        primary_color: primaryColor,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      });

      if (err) throw err;

      // Apply CSS variable live
      document.documentElement.style.setProperty("--brand-primary", primaryColor);

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
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

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>
            Appears on the login screen and next to the app name in the sidebar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                PNG, JPG, SVG or WebP. Square works best.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>App name & color</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
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

            {/* Preview */}
            <div className="rounded-xl border p-4 bg-slate-50">
              <p className="text-xs text-muted-foreground mb-2">Preview</p>
              <div className="flex items-center gap-2">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-8 w-8 object-contain rounded" />
                ) : (
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
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

            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
            )}
            {saved && (
              <p className="text-sm text-green-600 bg-green-50 p-3 rounded-md">
                Branding saved. Refresh the page to see it everywhere.
              </p>
            )}

            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save branding"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
