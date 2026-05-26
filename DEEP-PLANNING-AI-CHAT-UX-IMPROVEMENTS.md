# Deep Planning: AI Chat UX Improvements

**Tanggal:** 26 Mei 2026  
**Status:** Planning Phase  
**Prioritas:** High

## 📋 Executive Summary

Dokumen ini merencanakan perbaikan UX untuk fitur AI Chat (KR·AI) dengan fokus pada:
1. Menyembunyikan floating chat button di halaman `/chat`
2. Menghapus console debugging yang mengekspos API key
3. Redesign layout chat interface (mobile-first)
4. Rebranding "Krai" → "KR·AI" dengan styling khusus
5. Memperbaiki error handling pada test koneksi

---

## 🎯 Goals & Objectives

### Primary Goals
1. **Security**: Hapus semua console.log yang mengekspos API key
2. **UX Consistency**: Floating chat tidak muncul di halaman chat dedicated
3. **Mobile Optimization**: Layout chat lebih compact dan user-friendly
4. **Branding**: Konsistensi nama "KR·AI" di seluruh aplikasi

### Success Metrics
- ✅ Zero API key exposure di browser console
- ✅ Floating button hidden di `/chat` dan `/chat/[id]`
- ✅ Chat input accessible dalam 1 tap di mobile
- ✅ Test koneksi success rate >95%

---

## 🔍 Current State Analysis

### Existing Issues

#### 1. **Security: API Key Exposure**
**Lokasi:**
- `app/api/ai/chat/route.ts` - console.log di error handling
- `components/ai/AIChatCore.tsx` - debugging logs
- `lib/ai/config.ts` - config logging

**Risiko:**
- API key terlihat di browser DevTools Console
- Potential unauthorized usage
- Security audit failure

#### 2. **Floating Chat Visibility**
**File:** `components/ai/AIChatFloat.tsx`
```typescript
// Current: Line 22
const isOnChatPage = pathname?.startsWith('/chat');

// Issue: Sudah ada logic, tapi perlu dipastikan bekerja
if (isOnChatPage) {
    return null;
}
```
**Status:** ✅ Already implemented, needs verification

#### 3. **Layout Issues (Mobile)**
**File:** `components/ai/AIChatFullscreen.tsx`

**Current Layout:**
```
┌─────────────────────────┐
│ Header (Halo, saya Krai)│
│ + Icon di atas          │
├─────────────────────────┤
│ Template Buttons (6x)   │ ← Terlalu banyak di mobile
├─────────────────────────┤
│ Chat Messages           │
├─────────────────────────┤
│ Input Box               │
├─────────────────────────┤
│ Model Selector          │ ← Di bawah input
└─────────────────────────┘
```

**Requested Layout:**
```
┌─────────────────────────┐
│ [Icon] Title + Subtitle │ ← Icon di samping, font lebih kecil
├─────────────────────────┤
│ Input Box               │ ← Pindah ke atas
├─────────────────────────┤
│ Model Selector          │ ← Di bawah input (ChatGPT style)
├─────────────────────────┤
│ Chat Messages           │
├─────────────────────────┤
│ Template (1 card only)  │ ← Max 1 pertanyaan
│ "Lihat Semua Template"  │
└─────────────────────────┘
```

#### 4. **Profile Card - Logout Button**
**File:** `components/layout/Sidebar.tsx` atau `MobileHeader.tsx`

**Current:**
- Logout button di bawah profile card
- Tampil sebagai full button dengan text

**Requested:**
- Pindah ke dalam profile card
- Pojok kanan, sejajar tengah
- Hanya tampilkan ikon merah (LogOut icon)

#### 5. **Test Koneksi Error**
**Error Message:**
```
Gagal menghubungi AI: Unexpected token 'd', "data: {"id"... is not valid JSON
```

**Root Cause Analysis:**
- Server mengirim SSE (Server-Sent Events) stream
- Client expect JSON response
- Parsing error karena format mismatch

**File:** `components/ai/AISettingsPage.tsx` - handleTest function

---

## 🛠️ Implementation Plan

### Phase 1: Security Fixes (Priority: CRITICAL)
**Estimasi:** 30 menit

#### Task 1.1: Remove Console Logs
**Files to modify:**
1. `app/api/ai/chat/route.ts`
2. `components/ai/AIChatCore.tsx`
3. `lib/ai/config.ts`
4. `lib/ai/configClient.ts`

**Action:**
```typescript
// REMOVE all instances of:
console.log('API Key:', apiKey);
console.log('Config:', config);
console.error('Error:', error);

// REPLACE with silent error handling or use server-side logging only
```

**Verification:**
- Open DevTools Console
- Perform AI chat operations
- Verify no sensitive data logged

---

### Phase 2: Branding Update (Priority: HIGH)
**Estimasi:** 45 menit

#### Task 2.1: Create KraiLogo Component Enhancement
**File:** `components/shared/KraiLogo.tsx`

**Current:**
```typescript
// Returns "Krai" as single styled text
```

**New Implementation:**
```typescript
export default function KraiLogo({ size = 'md' }: { size?: 'xs' | 'sm' | 'md' | 'lg' }) {
    const sizes = {
        xs: 'text-xs',
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg'
    };
    
    return (
        <span className={`inline-flex items-center ${sizes[size]}`}>
            <span className="font-bold text-blue-600">KR</span>
            <span className="text-gray-400 mx-0.5">·</span>
            <span className="font-bold text-gray-900">AI</span>
        </span>
    );
}
```

#### Task 2.2: Replace All "Krai" References
**Files to update:**
1. `components/ai/AIChatFullscreen.tsx`
2. `components/ai/AIChatFloat.tsx`
3. `components/ai/AIChatCore.tsx`
4. `components/layout/Sidebar.tsx`
5. `app/(dashboard)/pengaturan/page.tsx`

**Search & Replace:**
```bash
# Find all instances
grep -r "Krai" components/ app/

# Replace with <KraiLogo /> component
```

---

### Phase 3: Layout Restructuring (Priority: HIGH)
**Estimasi:** 2 jam

#### Task 3.1: Redesign AIChatFullscreen Header
**File:** `components/ai/AIChatFullscreen.tsx`

**Changes:**
1. Move AI icon from top to left side of title
2. Reduce title font size: `text-2xl` → `text-lg`
3. Reduce subtitle font size: `text-base` → `text-sm`

**Before:**
```tsx
<div className="text-center">
    <Bot className="w-12 h-12 mx-auto mb-3" />
    <h1 className="text-2xl font-bold">Halo, saya Krai!</h1>
    <p className="text-base text-gray-600">Asisten AI...</p>
</div>
```

**After:**
```tsx
<div className="flex items-start gap-3">
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center flex-shrink-0">
        <Bot className="w-5 h-5 text-white" />
    </div>
    <div>
        <h1 className="text-lg font-bold">
            Halo, saya <KraiLogo size="sm" />!
        </h1>
        <p className="text-sm text-gray-600 mt-0.5">
            Saya adalah asisten AI Kakarama Room yang dilatih khusus membantu menganalisa data laporan bisnis Kakarama Room.
        </p>
    </div>
</div>
```

#### Task 3.2: Reorder Chat Layout
**File:** `components/ai/AIChatFullscreen.tsx`

**New Component Order:**
```tsx
<div className="flex flex-col h-full">
    {/* 1. Header with icon + title */}
    <Header />
    
    {/* 2. Chat Input - MOVED UP */}
    <ChatInput />
    
    {/* 3. Model Selector - Below input */}
    <ModelSelector />
    
    {/* 4. Chat Messages - Scrollable */}
    <MessageList />
    
    {/* 5. Template Cards - Bottom, max 1 card */}
    <TemplateCards maxCards={1} />
</div>
```

#### Task 3.3: Simplify Template Buttons
**File:** `components/ai/AIChatFullscreen.tsx`

**Remove these buttons:**
- 📍 Per Lokasi
- 👥 Customer & Tamu
- 💰 Keuangan & Laba
- 🏠 Operasional & Unit
- 📢 Marketing & Fee
- 💡 Insight & Rekomendasi

**Keep only:**
- Template question cards (max 1 on mobile)
- "Lihat Semua Template" button

**Implementation:**
```tsx
// Remove category filter buttons
// Show only 1 template card on mobile, 2 on desktop
const maxTemplates = isMobile ? 1 : 2;

<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    {templates.slice(0, maxTemplates).map(template => (
        <TemplateCard key={template.id} {...template} />
    ))}
</div>

<Link href="/analytics-ai/templates" className="...">
    📋 Lihat semua template →
</Link>
```

#### Task 3.4: Move Model Selector Below Input
**File:** `components/ai/AIChatCore.tsx`

**Current Position:** Top bar or separate section  
**New Position:** Directly below chat input

**Design (ChatGPT-style):**
```tsx
<div className="border-t border-gray-200 px-4 py-2 bg-gray-50">
    <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500">Model:</span>
        <button className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-200">
            <Zap className="w-3 h-3" />
            <span>Auto</span>
        </button>
        <button className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-200">
            <Zap className="w-3 h-3 text-blue-600" />
            <span>Instant</span>
        </button>
        <button className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-200">
            <Brain className="w-3 h-3 text-purple-600" />
            <span>Thinking</span>
        </button>
    </div>
</div>
```

---

### Phase 4: Profile Card Logout Button (Priority: MEDIUM)
**Estimasi:** 30 menit

#### Task 4.1: Modify Sidebar Profile Card
**File:** `components/layout/Sidebar.tsx`

**Current Structure:**
```tsx
<div className="profile-card">
    <Avatar />
    <UserInfo />
</div>
<button className="logout-button">
    <LogOut /> Keluar
</button>
```

**New Structure:**
```tsx
<div className="profile-card relative">
    <Avatar />
    <UserInfo />
    <button className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-red-50 rounded-lg transition-colors">
        <LogOut className="w-4 h-4 text-red-600" />
    </button>
</div>
```

**Mobile Header:** Apply same pattern to `components/layout/MobileHeader.tsx`

---

### Phase 5: Fix Test Koneksi Error (Priority: CRITICAL)
**Estimasi:** 1 jam

#### Task 5.1: Analyze Error Root Cause
**Error:**
```
Unexpected token 'd', "data: {"id"... is not valid JSON
```

**Diagnosis:**
- Server returns SSE stream: `data: {"id": "..."}\n\n`
- Client tries to parse as JSON
- First character is 'd' from "data:", not '{'

#### Task 5.2: Fix Response Parsing
**File:** `components/ai/AISettingsPage.tsx` - handleTest function

**Current Code (Lines ~200-230):**
```typescript
const res = await fetch('/api/ai/chat', { ... });
const contentType = res.headers.get('content-type');
let data: any;

if (contentType?.includes('application/json')) {
    data = await res.json();
} else {
    const text = await res.text();
    try {
        data = JSON.parse(text);
    } catch {
        data = { error: 'Respons tidak valid dari server' };
    }
}
```

**Issue:** SSE stream format not handled

**Fix:**
```typescript
const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        messages: [{ role: 'user', content: 'Test connection' }],
        config: { ... },
        stream: false, // ← FORCE non-streaming for test
    }),
});

if (!res.ok) {
    const errorText = await res.text();
    // Try to parse as JSON first
    try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || 'Connection failed');
    } catch {
        // If not JSON, use text as error
        throw new Error(errorText || 'Connection failed');
    }
}

// Success - parse response
const data = await res.json();
setTestResult({ 
    success: true, 
    message: data.message || 'Koneksi berhasil!' 
});
```

#### Task 5.3: Update API Route to Support Non-Streaming
**File:** `app/api/ai/chat/route.ts`

**Add parameter:**
```typescript
export async function POST(req: Request) {
    const { messages, config, stream = true } = await req.json();
    
    if (!stream) {
        // Return simple JSON response for testing
        const response = await callAI(messages, config);
        return NextResponse.json({
            message: response,
            success: true
        });
    }
    
    // Existing streaming logic...
}
```

---

## 📱 Mobile-First Considerations

### Responsive Breakpoints
```css
/* Mobile: < 640px */
- Single column layout
- Max 1 template card
- Compact header
- Full-width input

/* Tablet: 640px - 1024px */
- 2 column template grid
- Sidebar collapsible

/* Desktop: > 1024px */
- Full sidebar visible
- 2-3 column template grid
- Larger chat area
```

### Touch Targets
- Minimum 44x44px for all interactive elements
- Adequate spacing between buttons (8px minimum)
- Swipe gestures for mobile navigation

---

## 🧪 Testing Strategy

### Unit Tests
1. **KraiLogo Component**
   - Renders correct HTML structure
   - Applies correct styling for each size
   - Blue "KR", gray dot, black "AI"

2. **Console Log Removal**
   - No API keys in console
   - No sensitive config data logged
   - Error handling works without logs

### Integration Tests
1. **Floating Chat Visibility**
   - Hidden on `/chat`
   - Hidden on `/chat/[id]`
   - Visible on other pages

2. **Test Koneksi**
   - Success with valid credentials
   - Clear error messages on failure
   - No JSON parsing errors

### Manual Testing Checklist
- [ ] Open `/chat` - floating button hidden
- [ ] Open `/dashboard` - floating button visible
- [ ] Test AI connection - no console errors
- [ ] Check all "Krai" → "KR·AI" replacements
- [ ] Verify logout button in profile card
- [ ] Test mobile layout (Chrome DevTools)
- [ ] Verify template cards (max 1 on mobile)
- [ ] Check model selector below input

---

## 📊 Risk Assessment

### High Risk
1. **Breaking Changes in Layout**
   - **Risk:** Reordering components may break existing functionality
   - **Mitigation:** Test thoroughly, use feature flags
   - **Rollback Plan:** Git revert to previous commit

2. **API Response Format Changes**
   - **Risk:** Non-streaming mode may affect other features
   - **Mitigation:** Add `stream` parameter, default to true
   - **Rollback Plan:** Remove parameter, keep streaming only

### Medium Risk
1. **Branding Consistency**
   - **Risk:** Missing some "Krai" references
   - **Mitigation:** Comprehensive grep search
   - **Rollback Plan:** Easy to revert text changes

### Low Risk
1. **Console Log Removal**
   - **Risk:** Harder to debug issues
   - **Mitigation:** Use server-side logging, error tracking
   - **Rollback Plan:** Add logs back if needed

---

## 📅 Timeline & Milestones

### Week 1: Security & Critical Fixes
- **Day 1-2:** Remove console logs, fix test koneksi
- **Day 3:** Testing & verification
- **Milestone:** Zero API key exposure, test koneksi works

### Week 2: UI/UX Improvements
- **Day 1-2:** Branding update (Krai → KR·AI)
- **Day 3-4:** Layout restructuring
- **Day 5:** Profile card logout button
- **Milestone:** New layout live, user feedback collected

### Week 3: Polish & Optimization
- **Day 1-2:** Mobile optimization
- **Day 3-4:** Performance testing
- **Day 5:** Documentation & handoff
- **Milestone:** Production-ready, documented

---

## 🚀 Deployment Strategy

### Staging Deployment
1. Deploy to staging environment
2. Run automated tests
3. Manual QA testing
4. Collect feedback from team

### Production Deployment
1. Feature flag: `ENABLE_NEW_CHAT_UX=true`
2. Gradual rollout: 10% → 50% → 100%
3. Monitor error rates
4. Rollback if error rate > 5%

### Rollback Plan
```bash
# If issues detected
git revert <commit-hash>
git push origin main
# Redeploy previous version
```

---

## 📝 Success Criteria

### Must Have (P0)
- ✅ No API keys in console
- ✅ Floating button hidden on `/chat`
- ✅ Test koneksi works without errors
- ✅ All "Krai" → "KR·AI" updated

### Should Have (P1)
- ✅ New layout implemented
- ✅ Model selector below input
- ✅ Max 1 template card on mobile
- ✅ Logout button in profile card

### Nice to Have (P2)
- ⭕ Smooth animations
- ⭕ Keyboard shortcuts
- ⭕ Accessibility improvements

---

## 🔄 Post-Launch Monitoring

### Metrics to Track
1. **Error Rate**
   - Target: < 1% of AI requests fail
   - Alert if > 5%

2. **User Engagement**
   - Chat sessions per user
   - Average messages per session
   - Template usage rate

3. **Performance**
   - Page load time < 2s
   - Time to first message < 1s
   - API response time < 3s

### Feedback Collection
- In-app feedback button
- User surveys after 1 week
- Support ticket analysis

---

## 📚 Documentation Updates

### Files to Update
1. `README.md` - Add KR·AI branding guidelines
2. `CHANGELOG.md` - Document all changes
3. `docs/AI_CHAT_GUIDE.md` - Update screenshots
4. `docs/TROUBLESHOOTING.md` - Add test koneksi fixes

---

## 👥 Team & Responsibilities

### Development
- **Frontend Lead:** Layout restructuring, component updates
- **Backend Lead:** API route modifications, streaming fixes
- **QA Lead:** Test plan execution, bug reporting

### Design
- **UI/UX Designer:** Review layout changes, provide feedback
- **Brand Manager:** Approve KR·AI branding

### Product
- **Product Manager:** Prioritization, stakeholder communication
- **Project Manager:** Timeline tracking, risk management

---

## 🎓 Lessons Learned (Post-Implementation)

_To be filled after implementation_

### What Went Well
- TBD

### What Could Be Improved
- TBD

### Action Items for Next Sprint
- TBD

---

## 📞 Support & Escalation

### Technical Issues
- **Slack:** #dev-support
- **Email:** dev@kakaramaroom.com
- **On-call:** Check PagerDuty schedule

### Product Questions
- **Slack:** #product-ai-chat
- **Email:** product@kakaramaroom.com

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-26  
**Next Review:** 2026-06-02  
**Owner:** Development Team
