# Travel Expense Tracker

A mobile-friendly business travel expense tracker built with **Next.js 15**, **Supabase**, and **Vercel**.

Scan receipts on the go, organize expenses by trip, generate reports, and download everything for accounting.

## Features

- Multi-user authentication (email + password)
- Create and manage business trips
- Mobile camera receipt capture + manual entry
- Expense categorization
- Per-trip and yearly reports
- Settings for profile / branding
- Fully responsive (mobile-first)
- Ready for Excel + ZIP export (next phase)

## Tech Stack

| Layer       | Technology              |
|-------------|-------------------------|
| Frontend    | Next.js 15 (App Router) |
| Styling     | Tailwind CSS            |
| Auth + DB   | Supabase                |
| Storage     | Supabase Storage        |
| Hosting     | Vercel                  |

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/saboaua/travel-expense-tracker.git
cd travel-expense-tracker
npm install
```

### 2. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Copy your **Project URL** and **anon/public key** from **Settings → API**.

### 3. Set up the Database

1. In the Supabase dashboard, open **SQL Editor**.
2. Paste and run the entire contents of `supabase/schema.sql`.
3. Create a Storage bucket named `receipts`:
   - Go to **Storage → New bucket**
   - Name: `receipts`
   - Public: **No** (private)
4. Add storage policies (also in the bottom of `schema.sql` as comments).

### 4. Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 5. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Deploy to Vercel

1. Push this repo to GitHub (already done).
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import this repository.
3. Add the same environment variables in the Vercel project settings.
4. Deploy.

## Project Structure

```
src/
  app/
    (dashboard)/          # Protected routes
      page.tsx            # Dashboard home
      trips/              # Trip list, create, detail
      reports/            # Yearly + trip reports
      settings/           # Profile & branding
    login/                # Auth pages
    signup/
  components/
    ui/                   # Reusable UI components
    layout/               # Sidebar + mobile nav
    expenses/             # Expense list component
  lib/
    supabase/             # Browser + server clients + middleware
    utils.ts
supabase/
  schema.sql              # Full database schema + RLS
```

## Roadmap / Next Features

- [ ] OCR receipt scanning (Google Vision / Tesseract + LLM extraction)
- [ ] Excel report generation per trip
- [ ] ZIP download (Excel + all receipt images)
- [ ] Yearly consolidated report
- [ ] Logo upload + color theme for reports
- [ ] Offline support / PWA
- [ ] Multi-currency conversion
- [ ] Team / shared trips

## License

MIT
