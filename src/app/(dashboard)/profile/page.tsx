"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressAvatarImage } from "@/lib/compress-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, User, Send, Check, Copy, ExternalLink, Key } from "lucide-react";

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  title: string | null;
  company_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

type TelegramStatus = {
  linked: boolean;
  bot: string;
  botUrl: string;
  code: string | null;
  expires: string | null;
  link: string | null;
};

export default function ProfilePage() {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Telegram
  const [featureOn, setFeatureOn] = useState(false);
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [linking, setLinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);

  async function loadTelegram() {
    const res = await fetch("/api/telegram/link");
    if (!res.ok) {
      setFeatureOn(false);
      return;
    }
    setFeatureOn(true);
    setStatus(await res.json());
  }

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setFirstName(profileData.first_name || "");
        setLastName(profileData.last_name || "");
        setTitle(profileData.title || "");
        setCompanyName(profileData.company_name || "");
        setEmail(profileData.email || user.email || "");
        setAvatarUrl(profileData.avatar_url);
      } else {
        setEmail(user.email || "");
      }
    }
    load();
    loadTelegram();
  }, [supabase]);

  useEffect(() => {
    if (!status?.link || status.linked) return;
    const id = setInterval(loadTelegram, 4000);
    return () => clearInterval(id);
  }, [status?.link, status?.linked]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Shrink and compress before upload so we never store a multi-megabyte original
      let processed: File;
      try {
        processed = await compressAvatarImage(file);
      } catch (compressErr) {
        // Formats the browser cannot decode (e.g. HEIC on some browsers): only allow small originals
        if (file.size > 500 * 1024) {
          throw new Error(
            compressErr instanceof Error && compressErr.message.startsWith("Please")
              ? compressErr.message
              : "This image format could not be processed. Please choose a JPG, PNG or WebP photo."
          );
        }
        processed = file;
      }

      const ext = processed.type === "image/jpeg" ? "jpg" : processed.name.split(".").pop() || "jpg";
      const filePath = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, processed, {
          cacheControl: "3600",
          upsert: true,
          contentType: processed.type || undefined,
        });

      if (uploadError) throw uploadError;

      // Best effort: remove older full-size copies saved under other extensions
      const stale = ["png", "jpeg", "webp", "heic", "gif"]
        .map((x) => `${user.id}/avatar.${x}`)
        .filter((x) => x !== filePath);
      supabase.storage.from("avatars").remove(stale).catch(() => {});

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const urlWithTs = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          avatar_url: urlWithTs,
          updated_at: new Date().toISOString(),
        });

      if (updateError) throw updateError;

      setAvatarUrl(urlWithTs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload avatar";
      setError(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      if (!user) throw new Error("Not authenticated");

      const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;

      const { error: updateError } = await supabase.from("profiles").upsert({
        id: user.id,
        first_name: firstName || null,
        last_name: lastName || null,
        full_name: fullName,
        title: title || null,
        company_name: companyName || null,
        email: email || null,
        updated_at: new Date().toISOString(),
      });

      if (updateError) throw updateError;

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSaved(false);

    if (newPassword.length < 6) {
      setPwError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }

    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      fetch("/api/auth/password-changed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "profile" }),
      }).catch(() => {});
      setPwSaved(true);
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwSaved(false), 4000);
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setPwLoading(false);
    }
  };

  const enableTelegram = async () => {
    setLinking(true);
    setTgError(null);
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create link");
      setStatus((prev) => ({
        linked: prev?.linked || false,
        bot: data.bot,
        botUrl: `https://t.me/${data.bot}`,
        code: data.code,
        expires: data.expires,
        link: data.link,
      }));
      window.open(data.link, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      setTgError(err instanceof Error ? err.message : "Could not create link");
    } finally {
      setLinking(false);
    }
  };

  const copyLink = async () => {
    if (!status?.link) return;
    await navigator.clipboard.writeText(status.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const disconnect = async () => {
    setLinking(true);
    try {
      await fetch("/api/telegram/link", { method: "DELETE" });
      await loadTelegram();
    } finally {
      setLinking(false);
    }
  };

  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    profile?.full_name ||
    "Your Profile";

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-1">
          Manage your personal information, password, and integrations
        </p>
      </div>

      {/* Avatar + basic info card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-border">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                title="Change photo"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>

            <div className="text-center sm:text-left flex-1">
              <h2 className="text-xl font-semibold">{displayName}</h2>
              {title && (
                <p className="text-muted-foreground">{title}</p>
              )}
              {companyName && (
                <p className="text-sm text-muted-foreground">{companyName}</p>
              )}
              {email && (
                <p className="text-sm text-muted-foreground mt-1">{email}</p>
              )}
              {uploading && (
                <p className="text-sm text-primary mt-2">Uploading photo...</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit form */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your profile details</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm font-medium">
                  First Name
                </label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm font-medium">
                  Last Name
                </label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                Title / Job Title
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Sales Manager"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="company" className="text-sm font-medium">
                Company
              </label>
              <Input
                id="company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Inc."
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
              <p className="text-xs text-muted-foreground">
                This is for display only. Changing login email requires account settings.
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
            )}
            {saved && (
              <p className="text-sm text-green-600 bg-green-50 p-3 rounded-md">
                Profile saved successfully
              </p>
            )}

            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password change */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="newPassword" className="text-sm font-medium">
                New Password
              </label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm New Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                autoComplete="new-password"
              />
            </div>

            {pwError && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{pwError}</p>
            )}
            {pwSaved && (
              <p className="text-sm text-green-600 bg-green-50 p-3 rounded-md">
                Password updated successfully
              </p>
            )}

            <Button type="submit" disabled={pwLoading}>
              {pwLoading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Telegram */}
      {featureOn && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Telegram
            </CardTitle>
            <CardDescription>
              Enable it to get a personal link that opens the chatbot for receipt uploads
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Status:{" "}
              {status?.linked ? (
                <span className="text-green-600 font-medium">Connected</span>
              ) : (
                <span className="text-muted-foreground">Not connected</span>
              )}
            </p>

            {status?.linked ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => window.open(status.botUrl, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open chatbot
                </Button>
                <Button variant="outline" onClick={disconnect} disabled={linking}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <>
                <Button onClick={enableTelegram} disabled={linking} className="gap-2">
                  <Send className="h-4 w-4" />
                  {linking ? "Creating link\u2026" : "Enable Telegram"}
                </Button>

                {status?.link && (
                  <div className="text-sm space-y-3 rounded-md bg-muted p-3">
                    <p>
                      Tap Start in Telegram to finish linking. This link expires in 15 minutes and works once.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2"
                        onClick={() => window.open(status.link!, "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open chatbot
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="gap-2" onClick={copyLink}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? "Copied" : "Copy link"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground break-all">{status.link}</p>
                  </div>
                )}
              </>
            )}

            {tgError && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{tgError}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
