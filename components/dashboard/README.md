# Dashboard Components

This directory contains reusable dashboard components for the Kakarama Room Analytics Dashboard.

## KartuRingkasan (KPI Card Component)

A flexible KPI card component that displays key performance indicators with support for loading states, error handling, trend indicators, and Indonesian locale formatting.

### Features

- ✅ Display title, value, and icon
- ✅ Optional trend indicator (positive/negative with color coding)
- ✅ Loading state with skeleton loader
- ✅ Error state with retry button
- ✅ Indonesian currency formatting (Rp X.XXX.XXX)
- ✅ Percentage formatting with 2 decimal places
- ✅ Responsive design with TailwindCSS
- ✅ Primary blue accent color for icons
- ✅ Rounded corners and soft shadows

### Props

```typescript
interface KartuRingkasanProps {
  title: string;           // Card title (e.g., "Booking Hari Ini")
  value: string | number;  // Display value (pre-formatted or number)
  icon: React.ReactNode;   // Icon component (e.g., from lucide-react)
  trend?: {
    value: number;         // Trend percentage (e.g., 12.5 for +12.5%)
    isPositive: boolean;   // true = green/up, false = red/down
  };
  isLoading?: boolean;     // Show skeleton loader
  error?: string;          // Error message to display
  onRetry?: () => void;    // Retry callback for error state
}
```

### Usage Examples

#### Basic Usage

```tsx
import KartuRingkasan from '@/components/dashboard/KartuRingkasan';
import { Calendar } from 'lucide-react';

<KartuRingkasan
  title="Booking Hari Ini"
  value="15"
  icon={<Calendar size={24} />}
/>
```

#### With Currency Formatting

```tsx
import KartuRingkasan, { formatCurrency } from '@/components/dashboard/KartuRingkasan';
import { DollarSign } from 'lucide-react';

<KartuRingkasan
  title="Pendapatan Hari Ini"
  value={formatCurrency(2500000)}
  icon={<DollarSign size={24} />}
  trend={{ value: 12.5, isPositive: true }}
/>
```

#### With Percentage Formatting

```tsx
import KartuRingkasan, { formatPercentage } from '@/components/dashboard/KartuRingkasan';
import { Users } from 'lucide-react';

<KartuRingkasan
  title="Okupansi Rata-rata"
  value={formatPercentage(75.5)}
  icon={<Users size={24} />}
  trend={{ value: -3.2, isPositive: false }}
/>
```

#### Loading State

```tsx
<KartuRingkasan
  title="Booking Hari Ini"
  value="0"
  icon={<Calendar size={24} />}
  isLoading={true}
/>
```

#### Error State with Retry

```tsx
const handleRetry = () => {
  // Refetch data
};

<KartuRingkasan
  title="Pendapatan Hari Ini"
  value="Rp 0"
  icon={<DollarSign size={24} />}
  error="Gagal memuat data"
  onRetry={handleRetry}
/>
```

#### Complete Dashboard Grid

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  <KartuRingkasan
    title="Booking Hari Ini"
    value="15"
    icon={<Calendar size={24} />}
  />
  
  <KartuRingkasan
    title="Pendapatan Hari Ini"
    value={formatCurrency(2500000)}
    icon={<DollarSign size={24} />}
    trend={{ value: 12.5, isPositive: true }}
  />
  
  <KartuRingkasan
    title="Okupansi Rata-rata"
    value={formatPercentage(75.5)}
    icon={<Users size={24} />}
    trend={{ value: -3.2, isPositive: false }}
  />
  
  <KartuRingkasan
    title="Unit Tersedia"
    value="8"
    icon={<Home size={24} />}
  />
</div>
```

### Helper Functions

#### formatCurrency(value: number): string

Formats a number as Indonesian Rupiah currency.

```typescript
formatCurrency(2500000)  // "Rp 2.500.000"
formatCurrency(1000)     // "Rp 1.000"
formatCurrency(500)      // "Rp 500"
```

**Format Rules:**
- Uses period (.) as thousand separator
- No decimal places
- Prefix: "Rp "

#### formatPercentage(value: number): string

Formats a number as percentage with 2 decimal places.

```typescript
formatPercentage(75.5)    // "75.50%"
formatPercentage(100)     // "100.00%"
formatPercentage(33.333)  // "33.33%"
```

**Format Rules:**
- Always 2 decimal places
- Suffix: "%"

### Styling

The component uses TailwindCSS classes and follows the design system:

- **Card**: White background, rounded corners (8px), soft shadow, border
- **Icon Container**: Primary blue background (#2563EB), rounded, 48x48px
- **Trend Positive**: Green text (#16A34A) with up arrow (↑)
- **Trend Negative**: Red text (#DC2626) with down arrow (↓)
- **Hover Effect**: Shadow increases on hover

### Requirements Satisfied

- ✅ Requirement 1.1: Display KPI cards
- ✅ Requirement 1.6: Skeleton loading states
- ✅ Requirement 1.7: Error state with retry
- ✅ Requirement 1.8: Indonesian Rupiah formatting
- ✅ Requirement 1.9: Percentage formatting with 2 decimals
- ✅ Requirement 9.2: Rounded corners and shadows
- ✅ Requirement 9.3: Primary blue accent color

### Testing

Run tests with:

```bash
npm run test components/dashboard/__tests__/KartuRingkasan.test.tsx
```

Test coverage includes:
- Basic rendering
- Loading states
- Error states
- Trend indicators
- Currency formatting
- Percentage formatting
- CSS styling

### Accessibility

- Semantic HTML structure
- Color contrast meets WCAG AA standards
- Error messages are clearly visible
- Interactive elements (retry button) are keyboard accessible

### Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Android Chrome)
- Requires JavaScript enabled for client-side interactivity

### Dependencies

- React 18+
- TailwindCSS 3+
- TypeScript 5+

### Notes

- This is a client component (`'use client'`)
- Values should be pre-formatted before passing to the component
- Use helper functions `formatCurrency` and `formatPercentage` for consistent formatting
- Icon should be a React component (e.g., from lucide-react)
- Minimum height is set to prevent layout shift during loading
