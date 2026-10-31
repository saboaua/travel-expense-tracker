"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, User, Plane, Receipt } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

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

interface TripSummary {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  currency: string;
  status: string;
  expenses: { amount: number }[];
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
  const [activeTrips, setActiveTrips] = useState<TripSummary[]>([]);
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

      // Active trips with expenses
      const { data: trips } = await supabase
        .from("trips")
        .select("id, name, start_date, end_date, currency, status, expenses(amount)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("start_date", { ascending: false });

      setActiveTrips((trips as TripSummary[]) || []);
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

      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      // Cache bust
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

  const totalActiveExpenses = activeTrips.reduce((sum, trip) => {
    const tripTotal =
      trip.expenses?.reduce((s, e) => s + Number(e.amount), 0) || 0;
    return sum + tripTotal;
  }, 0);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-1">
          Manage your personal information and view current trips
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

      {/* Current trip expenses overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            Current Trip Expenses
          </CardTitle>
          <CardDescription>
            Overview of your active business travels
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeTrips.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-4">No active trips</p>
              <Link href="/trips/new">
                <Button variant="outline" size="sm">
                  Start a new trip
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-baseline justify-between pb-3 border-b">
                <span className="text-sm text-muted-foreground">
                  Total across active trips
                </span>
                <span className="text-xl font-bold">
                  {formatCurrency(totalActiveExpenses)}
                </span>
              </div>

              {activeTrips.map((trip) => {
                const tripTotal =
                  trip.expenses?.reduce(
                    (s, e) => s + Number(e.amount),
                    0
                  ) || 0;

                return (
                  <Link
                    key={trip.id}
                    href={`/trips/${trip.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div>
                      <p className="font-medium">{trip.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(trip.start_date)}
                        {trip.end_date && ` – ${formatDate(trip.end_date)}`}
                        {" · "}
                        {trip.expenses?.length || 0} expense
                        {(trip.expenses?.length || 0) !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <p className="font-semibold">
                      {formatCurrency(tripTotal, trip.currency)}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
