# Supabase Client Utilities

This directory contains utilities for creating Supabase clients with proper security configurations.

## Files

- **`server.ts`**: Server-side Supabase client with service role key
- **`client.ts`**: Browser-side Supabase client with anonymous key

## Usage

### Server-Side Client (Service Role Key)

Use this client in Server Components, Server Actions, and API Routes. This client has elevated privileges and bypasses Row Level Security (RLS).

**⚠️ SECURITY WARNING**: Never expose this client or use it in client components!

```typescript
// In a Server Component or Server Action
import { createServerClient } from '@/lib/supabase/server';

export async function fetchData() {
  'use server';
  
  const supabase = createServerClient();
  
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .limit(10);
  
  if (error) {
    console.error('Error fetching data:', error);
    throw new Error('Failed to fetch data');
  }
  
  return data;
}
```

### Browser-Side Client (Anonymous Key)

Use this client in Client Components for real-time subscriptions or client-side operations. This client respects Row Level Security policies.

```typescript
'use client';

import { createBrowserClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

export function RealtimeComponent() {
  const [data, setData] = useState([]);
  
  useEffect(() => {
    const supabase = createBrowserClient();
    
    // Subscribe to real-time changes
    const channel = supabase
      .channel('transactions')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'transactions'
      }, (payload) => {
        console.log('New transaction:', payload.new);
        // Update state with new data
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  
  return <div>{/* Your component */}</div>;
}
```

## Environment Variables

### Required for Server-Side Client

- `VITE_SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (⚠️ Keep secret!)

### Required for Browser-Side Client

- `NEXT_PUBLIC_SUPABASE_URL` or `VITE_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`: Your Supabase anonymous key

### Example `.env` file

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Optional: Next.js specific variables (if using Next.js)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## Security Best Practices

1. **Never expose the service role key**: The service role key should only be used server-side and never sent to the browser.

2. **Use the correct client**: 
   - Server-side operations → `createServerClient()`
   - Browser-side operations → `createBrowserClient()`

3. **Implement Row Level Security**: Always enable RLS on your Supabase tables to protect data when using the browser client.

4. **Validate user authentication**: Before returning sensitive data from server actions, validate that the user is authenticated and authorized.

5. **Handle errors gracefully**: Always catch and handle errors from Supabase operations without exposing internal details to the client.

## Type Safety

Both clients are typed with the `Database` type from `@/types/database.ts`, providing full TypeScript type safety for all database operations.

```typescript
import type { Database } from '@/types/database';

// The client knows about your database schema
const supabase = createServerClient();

// TypeScript will autocomplete table names and columns
const { data } = await supabase
  .from('transactions') // ✅ TypeScript knows this table exists
  .select('customer_name, cash_amount') // ✅ TypeScript knows these columns exist
  .eq('status', 'completed'); // ✅ TypeScript validates the query
```

## Calling RPC Functions

Both clients support calling Supabase RPC (Remote Procedure Call) functions:

```typescript
const supabase = createServerClient();

const { data, error } = await supabase.rpc('get_daily_revenue_trend', {
  p_start_date: '2024-01-01',
  p_end_date: '2024-01-31',
  p_location: null,
  p_limit: 100,
  p_offset: 0
});
```

## Error Handling

Always implement proper error handling:

```typescript
try {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('transactions').select('*');
  
  if (error) {
    throw error;
  }
  
  return data;
} catch (error) {
  console.error('Database error:', error);
  // Log error server-side but return user-friendly message
  throw new Error('Failed to fetch data. Please try again later.');
}
```
