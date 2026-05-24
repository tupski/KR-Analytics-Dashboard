# RealTimeClock Component Documentation

## Overview

The RealTimeClock component displays the current time in Asia/Jakarta timezone with a blinking colon separator. It's designed to be used in the dashboard header to provide users with real-time awareness of the current time.

## Visual Representation

```
┌─────────────────────────┐
│   Dashboard Header      │
├─────────────────────────┤
│                         │
│  Dashboard Analytics    │
│                    14:30│  ← RealTimeClock
│                         │
└─────────────────────────┘

Time Display Format:
┌──┬─┬──┐
│HH│:│mm│
└──┴─┴──┘
 │  │  │
 │  │  └─ Minutes (00-59)
 │  └──── Colon (blinks every 500ms)
 └─────── Hours (00-23)
```

## Animation Behavior

### Time Update (Every 1 second)
```
t=0s:  14:30
t=1s:  14:31
t=2s:  14:32
...
```

### Colon Blink (Every 500ms)
```
t=0ms:    14:30  (colon visible, opacity: 1)
t=500ms:  14 30  (colon hidden, opacity: 0)
t=1000ms: 14:30  (colon visible, opacity: 1)
t=1500ms: 14 30  (colon hidden, opacity: 0)
...
```

## Component Structure

```tsx
RealTimeClock
│
├── <div> (container)
│   ├── className: "flex items-center text-2xl font-mono text-gray-900"
│   │
│   ├── <span> (hours)
│   │   └── content: "14"
│   │
│   ├── <span> (colon)
│   │   ├── className: "transition-opacity duration-100"
│   │   ├── style: { opacity: showColon ? 1 : 0 }
│   │   └── content: ":"
│   │
│   └── <span> (minutes)
│       └── content: "30"
```

## State Management

```typescript
// Component State
┌─────────────────────────────────┐
│ time: Date                      │
│ - Current time object           │
│ - Updated every 1000ms          │
│ - Initial: new Date()           │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ showColon: boolean              │
│ - Colon visibility flag         │
│ - Toggled every 500ms           │
│ - Initial: true                 │
└─────────────────────────────────┘
```

## Effect Lifecycle

```
Component Mount
│
├── Create timeInterval (1000ms)
│   └── Updates: time state
│
├── Create colonInterval (500ms)
│   └── Toggles: showColon state
│
└── Return cleanup function
    │
    └── Component Unmount
        ├── clearInterval(timeInterval)
        └── clearInterval(colonInterval)
```

## Data Flow

```
┌─────────────┐
│  new Date() │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│ toZonedTime()           │
│ timezone: Asia/Jakarta  │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ format(time, 'HH')      │ ──→ hours: "14"
│ format(time, 'mm')      │ ──→ minutes: "30"
└─────────────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Render: 14:30           │
└─────────────────────────┘
```

## Styling Details

### Typography
- **Font Family:** Monospace (`font-mono`)
  - Ensures consistent digit width
  - Prevents layout shift during time updates
  - Example: "14:30" → "14:31" (no width change)

- **Font Size:** 24px (`text-2xl`)
  - Exceeds minimum requirement of 16px
  - Readable on both desktop and mobile
  - Scales well with responsive design

- **Font Color:** Dark Gray (`text-gray-900`)
  - High contrast for readability
  - Meets WCAG AA standards
  - Professional appearance

### Animation
- **Transition:** Opacity (`transition-opacity duration-100`)
  - Smooth fade in/out effect
  - Duration: 100ms
  - Applied to colon element only

- **Opacity Values:**
  - Visible: `opacity: 1` (fully opaque)
  - Hidden: `opacity: 0` (fully transparent)

### Layout
- **Display:** Flex (`flex`)
  - Horizontal alignment of hours, colon, minutes
  - Prevents wrapping

- **Alignment:** Center (`items-center`)
  - Vertically centers all elements
  - Ensures consistent baseline

## Usage Examples

### Basic Usage
```tsx
import RealTimeClock from '@/components/dashboard/RealTimeClock';

function Header() {
  return (
    <header>
      <h1>Dashboard</h1>
      <RealTimeClock />
    </header>
  );
}
```

### With Label
```tsx
function HeaderWithLabel() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">Waktu:</span>
      <RealTimeClock />
    </div>
  );
}
```

### In Card
```tsx
function ClockCard() {
  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <div className="text-xs text-gray-500 mb-1">Waktu Jakarta (WIB)</div>
      <RealTimeClock />
    </div>
  );
}
```

## Timezone Information

### Asia/Jakarta (WIB)
- **Timezone:** Western Indonesian Time
- **UTC Offset:** +07:00
- **No Daylight Saving Time**

### Example Conversions
```
UTC Time:     07:30
Jakarta Time: 14:30 (UTC+7)

UTC Time:     23:30
Jakarta Time: 06:30 (next day, UTC+7)
```

## Performance Characteristics

### Memory Usage
- **State:** 2 state variables (time: Date, showColon: boolean)
- **Intervals:** 2 active intervals (cleared on unmount)
- **DOM Nodes:** 4 elements (1 div, 3 spans)

### Update Frequency
- **Time Updates:** 1 per second (1 Hz)
- **Colon Updates:** 2 per second (2 Hz)
- **Total Re-renders:** ~3 per second

### Optimization
- Minimal state updates
- No unnecessary re-renders
- Efficient DOM structure
- CSS-based animations (GPU accelerated)

## Accessibility Considerations

### Current Implementation
- ✅ High contrast text (WCAG AA compliant)
- ✅ Readable font size (24px)
- ✅ Semantic HTML structure

### Future Enhancements
- Add `aria-live="polite"` for screen reader updates
- Add `role="timer"` for semantic meaning
- Consider reducing update frequency for screen readers
- Add option to disable blinking for users with motion sensitivity

## Browser Compatibility

### Supported Browsers
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

### Required Features
- ES6+ JavaScript
- React 18+
- CSS Flexbox
- CSS Transitions
- setInterval API

## Testing

### Test Scenarios
1. **Initial Render:** Displays current time
2. **Time Updates:** Updates every second
3. **Colon Blink:** Toggles every 500ms
4. **Cleanup:** Clears intervals on unmount
5. **Styling:** Applies correct CSS classes
6. **Format:** Displays HH:mm format
7. **Timezone:** Uses Asia/Jakarta timezone

### Test Tools
- Vitest (test runner)
- React Testing Library (component testing)
- Fake Timers (time control)

## Troubleshooting

### Clock Not Updating
- **Cause:** Intervals not running
- **Solution:** Check useEffect dependencies, ensure component is mounted

### Wrong Timezone
- **Cause:** date-fns-tz not configured correctly
- **Solution:** Verify `toZonedTime(time, 'Asia/Jakarta')` is called

### Colon Not Blinking
- **Cause:** CSS transition not applied or interval not running
- **Solution:** Check `showColon` state and CSS classes

### Memory Leak
- **Cause:** Intervals not cleared on unmount
- **Solution:** Verify cleanup function in useEffect returns clearInterval calls

## Related Components

- **HeaderDashboard:** Parent component that includes RealTimeClock
- **AutoRefreshWrapper:** Manages dashboard data refresh (separate from clock)
- **KartuRingkasan:** KPI cards that may show time-based data

## Requirements Traceability

| Requirement | Description | Status |
|-------------|-------------|--------|
| 16.1 | Display in header/top section | ✅ Ready for integration |
| 16.2 | 24-hour format (HH:mm) | ✅ Implemented |
| 16.3 | Asia/Jakarta timezone | ✅ Implemented |
| 16.4 | Update every second | ✅ Implemented |
| 16.5 | Blinking colon separator | ✅ Implemented |
| 16.6 | Blink interval (0.5s visible, 0.5s hidden) | ✅ Implemented |
| 16.7 | Minimum 16px font size | ✅ Implemented (24px) |
| 16.8 | Visible on desktop and mobile | ✅ Responsive design |
| 16.9 | Continue updating when idle | ✅ Implemented |

## Version History

### v1.0.0 (Current)
- Initial implementation
- Basic time display with blinking colon
- Asia/Jakarta timezone support
- Comprehensive test suite
- Documentation and examples
