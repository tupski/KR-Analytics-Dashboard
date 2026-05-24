# Kakarama Room Analytics Dashboard

A comprehensive web-based analytics dashboard for apartment rental management, built with Next.js 15, TypeScript, TailwindCSS, and Supabase PostgreSQL.

## Features

- **Real-time KPI Monitoring**: Track today's bookings, revenue, occupancy rates, and unit availability
- **Revenue Analytics**: Interactive charts with time-based filtering (daily, weekly, monthly, yearly)
- **Occupancy Tracking**: Visual representation of occupancy rates over time
- **Operational Dashboard**: Today's check-in/check-out lists for managing guest arrivals and departures
- **Unit Status Overview**: Real-time summary of unit availability and status
- **Auto-refresh**: Automatic data updates every 60 seconds
- **Responsive Design**: Optimized for both desktop and mobile devices
- **Indonesian Localization**: Full Indonesian language support with proper locale formatting

## Technology Stack

- **Frontend**: Next.js 15 with App Router and Server Components
- **Language**: TypeScript
- **Styling**: TailwindCSS with shadcn/ui components
- **Data Visualization**: Recharts
- **Backend**: Supabase PostgreSQL with RPC functions
- **Authentication**: Supabase Auth with Row Level Security

## Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- A Supabase project with the required database schema
- Environment variables configured (see below)

## Environment Variables

This application requires the following environment variables to be configured. Copy `.env.example` to `.env.local` and fill in your actual values:

### Required Environment Variables

#### `NEXT_PUBLIC_SUPABASE_URL`
- **Type**: Public (safe to expose to browser)
- **Description**: Your Supabase project URL
- **Example**: `https://your-project.supabase.co`
- **Where to find**: Supabase Dashboard → Project Settings → API → Project URL

#### `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Type**: Public (safe to expose to browser)
- **Description**: Your Supabase anonymous/publishable key
- **Example**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Where to find**: Supabase Dashboard → Project Settings → API → Project API keys → `anon` `public`
- **Security**: This key is safe to use in the browser as it respects Row Level Security (RLS) policies

#### `SUPABASE_SERVICE_ROLE_KEY`
- **Type**: Server-only (NEVER expose to browser)
- **Description**: Your Supabase service role key with elevated privileges
- **Example**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Where to find**: Supabase Dashboard → Project Settings → API → Project API keys → `service_role` `secret`
- **Security**: ⚠️ **CRITICAL** - This key bypasses Row Level Security and has full database access. It must ONLY be used in server-side code (Server Components, Server Actions, API Routes) and NEVER exposed to the browser.

### Optional Environment Variables

#### `NEXT_PUBLIC_APP_URL`
- **Type**: Public
- **Description**: Your application's base URL
- **Default**: `http://localhost:3000` (development)
- **Production Example**: `https://your-domain.com`

## Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd KR-Analytics-Dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and fill in your Supabase credentials:
   - Get your Supabase URL and keys from the [Supabase Dashboard](https://app.supabase.com)
   - Navigate to: Project Settings → API
   - Copy the Project URL, anon key, and service_role key

4. **Set up the database**
   - Ensure your Supabase project has the required database schema
   - Run the migration files in the `supabase-schema/` directory if needed
   - Verify that the required RPC functions exist:
     - `get_daily_revenue_trend`
     - `get_location_fullness`
     - `get_occupancy_per_unit`

5. **Run the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

6. **Open the application**
   - Navigate to [http://localhost:3000](http://localhost:3000)
   - The dashboard should be available at `/dashboard`

## Environment Variable Validation

The application includes built-in environment variable validation:

- **Server-side validation**: The `createServerClient()` function in `lib/supabase/server.ts` validates that `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present before creating a client.
- **Client-side validation**: The `createBrowserClient()` function in `lib/supabase/client.ts` validates that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present.
- **Error messages**: Clear error messages are displayed if any required environment variables are missing, guiding you to add them to your `.env.local` file.

## Security Best Practices

### Environment Variable Security

1. **Never commit `.env.local` to version control**
   - The `.env.local` file is already in `.gitignore`
   - Only commit `.env.example` with placeholder values

2. **Service Role Key Protection**
   - The `SUPABASE_SERVICE_ROLE_KEY` must NEVER be exposed to the browser
   - Only use it in server-side code:
     - ✅ Server Components (no `'use client'` directive)
     - ✅ Server Actions (functions with `'use server'` directive)
     - ✅ API Routes (`app/api/**/route.ts`)
   - Never use it in:
     - ❌ Client Components (files with `'use client'`)
     - ❌ Browser-side code
     - ❌ Public API endpoints

3. **Row Level Security (RLS)**
   - All database tables should have RLS policies enabled
   - The anon key respects RLS policies
   - The service role key bypasses RLS (use with caution)

4. **Environment-specific keys**
   - Use different Supabase projects for development, staging, and production
   - Never use production keys in development environments

## Project Structure

```
KR-Analytics-Dashboard/
├── app/                      # Next.js App Router
│   └── dashboard/           # Dashboard page and server actions
├── components/              # React components
│   ├── dashboard/          # Dashboard-specific components
│   └── layout/             # Layout components (Sidebar, Navigation)
├── lib/                    # Utility libraries
│   └── supabase/          # Supabase client utilities
├── types/                  # TypeScript type definitions
├── supabase/              # Supabase configuration
├── supabase-schema/       # Database migration files
├── .env.local            # Local environment variables (not in git)
├── .env.example          # Environment variable template
└── README.md             # This file
```

## Troubleshooting

### "Missing NEXT_PUBLIC_SUPABASE_URL environment variable"

**Solution**: Ensure you have created a `.env.local` file in the project root with the required environment variables. Copy `.env.example` to `.env.local` and fill in your Supabase credentials.

### "Missing SUPABASE_SERVICE_ROLE_KEY environment variable"

**Solution**: Add the `SUPABASE_SERVICE_ROLE_KEY` to your `.env.local` file. You can find this key in your Supabase Dashboard under Project Settings → API → service_role key.

### Dashboard shows no data

**Possible causes**:
1. Database schema is not set up correctly
2. Required RPC functions are missing
3. Row Level Security policies are blocking access
4. Environment variables are incorrect

**Solution**: 
- Verify your Supabase project has the required tables and RPC functions
- Check the browser console and server logs for error messages
- Ensure your Supabase URL and keys are correct

### Service role key is exposed in browser

**Solution**: This is a critical security issue. Ensure:
1. You're only using `createServerClient()` in server-side code
2. Server Actions have the `'use server'` directive
3. Server Components don't have the `'use client'` directive
4. You're not passing the service role key to client components

## Development

### Running Tests

```bash
npm run test
# or
yarn test
# or
pnpm test
```

### Type Checking

```bash
npm run type-check
# or
yarn type-check
# or
pnpm type-check
```

### Linting

```bash
npm run lint
# or
yarn lint
# or
pnpm lint
```

## Deployment

### Vercel (Recommended)

1. Push your code to a Git repository (GitHub, GitLab, Bitbucket)
2. Import your project in [Vercel](https://vercel.com)
3. Configure environment variables in Vercel:
   - Go to Project Settings → Environment Variables
   - Add all required environment variables from `.env.local`
   - Ensure `SUPABASE_SERVICE_ROLE_KEY` is marked as "Secret"
4. Deploy!

### Other Platforms

Ensure your deployment platform:
- Supports Next.js 15 with App Router
- Allows you to set environment variables securely
- Supports server-side rendering (SSR)

## License

[Your License Here]

## Support

For issues and questions, please [open an issue](https://github.com/your-repo/issues) on GitHub.
