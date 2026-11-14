"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressAvatarImage } from "@/lib/compress-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AccordionGroup, AccordionSection } from "@/components/ui/accordion";
import { Camera, User } from "lucide-react";
import { PasswordCard } from "@/components/profile/PasswordCard";
import { TelegramCard } from "@/components/profile/TelegramCard";
import { HomePlaceCard } from "@/components/profile/HomePlaceCard";
import { SharingCard } from "@/components/profile/SharingCard";
import { NotificationsCard } from "@/components/profile/NotificationsCard";
import { YourDataCard } from "@/components/profile/YourDataCard";
import { CommunityCard } from "@/components/profile/CommunityCard";

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

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, full_name, title, company_name, email, avatar_url")
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
  }, [supabase]);

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

  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    profile?.full_name ||
    "Your Profile";

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader title="Profile" description={<>Manage your personal information, password, and integrations</>} />

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
      <AccordionGroup>
      <AccordionSection
        id="personal"
        title="Personal information"
        icon={<User />}
        summary={[displayName, title].filter(Boolean).join(" · ") || "Your name, title and company"}
        description="Update your profile details"
      >
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
              <Alert>{error}</Alert>
            )}
            {saved && (
              <Alert variant="success">
                Profile saved successfully
              </Alert>
            )}

            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </form>
      </AccordionSection>

      <SharingCard />

      <HomePlaceCard />

      <CommunityCard />

      <PasswordCard />

      <NotificationsCard />

      <TelegramCard />

      <YourDataCard />
      </AccordionGroup>
    </div>
  );
}
