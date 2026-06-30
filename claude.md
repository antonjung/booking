# overview
A PWA app to manage room bookings at a village hall. Configurable for any venue with multiple rooms or facilities.

# tech stack
- **Frontend**: React + Vite + TypeScript + Tailwind CSS, deployed to Cloudflare Pages (`booking-9c3.pages.dev`)
- **Database/Auth/API**: Supabase (PostgreSQL + Auth + Edge Functions) at `https://urncbgicbxjwniebfjgt.supabase.co`
- **Deploy frontend**: `npm run build` then `npx wrangler pages deploy dist --project-name booking` (from `frontend/`)
- **Deploy Edge Functions**: `supabase functions deploy <name>` (from repo root, requires Supabase CLI)
- Cloudflare Pages also auto-deploys on push to GitHub (`master` branch)
- Login uses **email** (not username) — auth managed by Supabase Auth
- User role stored in `auth.users.app_metadata.role` (synced by `admin-user` Edge Function) and in `public.users.role`

# user roles
- **admin** — manage users and facilities; can make bookings
- **controller** — approve/deny bookings; can make bookings
- **booker** — make booking requests, view calendar

All roles can create bookings.

# bookings
- For a date, time, and duration (in 30-minute slots), for a specific facility
- On creation, controller receives a notification
- Controller approves or denies; booker is notified of outcome
- Pending bookings can be rescheduled by drag-and-drop in calendar (bookers: own bookings only; controllers/admins: any)
- PATCH `/api/bookings/:id` handles reschedule (pending only)

# users
Profile: name, email, phone, organisation, contact preference (email / notification / both)

# facilities
- Types: `room`, `service`, `equipment`
- `is_whole_hall = true` marks a facility that represents the entire venue (requires all rooms free)
- Whole-hall bookings appear in calendar when a `room`-type facility is filtered, but not when a service/equipment facility is filtered

# calendar (home screen `/`)
- Views: month, week, day, list
- Week view: days across top, hours down side; `WEEK_SLOT_PX = 12` (24px/hour, no scroll)
- Day view: `SLOT_PX = 48` (96px/hour, scrollable)
- Bookings shown as solid color blocks (no text) in month and week views
- Facility color key shown on all views
- Facility filter dropdown ("All rooms" default)
- Swipe left/right animates navigation between periods
- Long press (1 second) on empty day cell opens new booking form
- Fixed-width date title (`w-64`) to prevent layout shift when navigating
- Month view pills: `h-6` for touch-friendly tap targets

# navigation
- Bottom nav bar (mobile-first)
- Top bar shows app name, version, notification bell, user avatar, logout
- Routes: `/` (Calendar), `/dashboard`, `/bookings`, `/bookings/new`, `/bookings/:id`, `/controller`, `/admin/users`, `/admin/facilities`, `/profile`

# version
Current: `v1.1.0` (shown in top navbar and login screen)

# key files
- `frontend/src/pages/Calendar.tsx` — main calendar with all views, drag-drop, swipe, long press
- `frontend/src/pages/BookingsList.tsx` — booking list with filters
- `frontend/src/pages/NewBooking.tsx` — booking creation form
- `frontend/src/pages/BookingDetail.tsx` — view/edit single booking
- `frontend/src/pages/ControllerPanel.tsx` — approve/deny queue
- `frontend/src/components/Layout.tsx` — nav shell
- `frontend/src/api/client.ts` — compatibility wrapper: maps old Express-style routes to Supabase queries/Edge Functions
- `frontend/src/lib/supabase.ts` — Supabase JS client (URL + anon key from env)
- `frontend/src/contexts/AuthContext.tsx` — Supabase Auth (email+password login, session management)
- `frontend/wrangler.jsonc` — Cloudflare Pages config (`pages_build_output_dir: "dist"`)
- `supabase/migrations/001_initial_schema.sql` — PostgreSQL schema + RLS policies
- `supabase/functions/create-booking/` — conflict detection + notification on new booking
- `supabase/functions/approve-booking/` — approve + notify booker
- `supabase/functions/deny-booking/` — deny + notify booker
- `supabase/functions/reschedule-booking/` — reschedule with conflict check
- `supabase/functions/admin-user/` — create/update/delete Supabase Auth users (admin only)
- `supabase/functions/_shared/` — shared CORS headers and email utilities (nodemailer/Gmail)
