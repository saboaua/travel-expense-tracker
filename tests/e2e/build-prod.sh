#!/bin/sh
# Builds the app for the end-to-end tests in production mode (E2E_PROD=1). The address and keys match the fake Supabase.
cd "$(dirname "$0")/../.." || exit 1
NEXT_FONT_GOOGLE_MOCKED_RESPONSES="$PWD/tests/e2e/mock-fonts.js" \
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54399" NEXT_PUBLIC_SUPABASE_ANON_KEY="anon-key" \
NEXT_TELEMETRY_DISABLED=1 exec npx next build
