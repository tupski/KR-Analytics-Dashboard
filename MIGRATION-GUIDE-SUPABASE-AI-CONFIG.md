# Migration Guide: localStorage → Supabase Database for AI Config

**Status:** 🚧 Ready to Implement  
**Priority:** High (Security & Data Persistence)  
**Complexity:** Medium-High (Async refactoring required)

---

## 📋 Overview

Migrate AI provider configuration storage from browser localStorage (plaintext) to Supabase database (AES-256-GCM encrypted).

### **Current Architecture**
- ✅ Client-side: localStorage stores API keys in plaintext
- ✅ Synchronous operations
- ❌ No encryption
- ❌ Data lost on browser clear
- ❌ No cross-device sync

### **Target Architecture**
- ✅ Server-side: Supabase stores encrypted API keys
- ✅ AES-256-GCM encryption with random IV
- ✅ Persistent across devices
- ✅ Secure (API keys never touch client in plaintext)
- ⚠️ Requires async operations

---

## ✅ Infrastructure Already Complete

### **1. Database Schema** ✅
File: `supabase-schema/20260526_ai_config_global.sql`

Table: `ai_provider_configs`
- Encryption: AES-256-GCM
- Unique constraint: (scope, provider_id)
- Auto-updated timestamps
- No RLS (service role only)

### **2. Server-Side Functions** ✅
File: `lib/ai/configServer.ts`

Functions available:
- `encryptApiKey(plaintext)` - Encrypt API key
- `decryptApiKey(enc, iv)` - Decrypt API key
- `loadAllProviderConfigs()` - Load all configs
- `upsertProviderConfig(conf)` - Save/update config
- `deleteProviderConfig(providerId)` - Delete config
- `setActiveProvider(providerId, modelId)` - Set active
- `setThinkingModeDb(providerId, mode)` - Set thinking mode

### **3. API Routes** ✅
File: `app/api/ai/config/route.ts`

Endpoints:
- `GET /api/ai/config` - Get all configs (masked keys)
- `POST /api/ai/config` - CRUD operations
  - action: 'upsert' | 'delete' | 'setActive' | 'setThinking'

---

## 🔧 Implementation Steps

### **Step 1: Environment Setup**

Add to `.env.local`:
```bash
# AI Configuration Encryption Key (32 bytes = 64 hex chars)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AI_ENCRYPTION_KEY=your_64_character_hex_key_here
```

Add to `.env.example`:
```bash
# AI Configuration Encryption Key
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AI_ENCRYPTION_KEY=
```

### **Step 2: Create Async Client Functions**

Create new file: `lib/ai/configClient.ts`

```typescript
/**
 * Client-side AI config management using Supabase API.
 * All operations are async and call /api/ai/config.
 */

import type { ProviderId } from './models';

export interface ProviderConfig {
    providerId: ProviderId;
    apiKey: string; // Masked on client (sk-••••••••1234)
    apiKeySet: boolean;
    model: string;
    baseUrl?: string;
    isActive: boolean;
    activeModel?: string;
    thinkingMode: string;
}

export interface MultiAIConfig {
    activeProvider: ProviderId | 'auto';
    activeModel: string;
    providers: ProviderConfig[];
    thinkingMode: 'auto' | 'instant' | 'thinking';
}

/**
 * Load all provider configs from database
 */
export async function loadConfigFromDb(): Promise<MultiAIConfig> {
    try {
        const res = await fetch('/api/ai/config');
        if (!res.ok) throw new Error('Failed to load config');
        const data = await res.json();
        
        const configs: ProviderConfig[] = data.configs || [];
        const active = configs.find(c => c.isActive);
        
        return {
            activeProvider: active?.providerId || 'auto',
            activeModel: active?.activeModel || 'auto',
            providers: configs,
            thinkingMode: active?.thinkingMode || 'auto',
        };
    } catch (error) {
        return {
            activeProvider: 'auto',
            activeModel: 'auto',
            providers: [],
            thinkingMode: 'auto',
        };
    }
}

/**
 * Save provider config to database
 */
export async function saveProviderConfigToDb(
    providerId: ProviderId,
    apiKey: string,
    model: string,
    baseUrl?: string,
    isActive?: boolean
): Promise<void> {
    const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'upsert',
            providerId,
            apiKey,
            model,
            baseUrl,
            isActive,
        }),
    });
    
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save config');
    }
}

/**
 * Delete provider config from database
 */
export async function deleteProviderConfigFromDb(providerId: ProviderId): Promise<void> {
    const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'delete',
            providerId,
        }),
    });
    
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete config');
    }
}

/**
 * Set active provider
 */
export async function setActiveProviderInDb(
    providerId: ProviderId,
    modelId: string
): Promise<void> {
    const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'setActive',
            providerId,
            modelId,
        }),
    });
    
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to set active provider');
    }
}

/**
 * Set thinking mode
 */
export async function setThinkingModeInDb(
    providerId: ProviderId,
    mode: 'auto' | 'instant' | 'thinking'
): Promise<void> {
    const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'setThinking',
            providerId,
            mode,
        }),
    });
    
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to set thinking mode');
    }
}

/**
 * Check if any provider is configured
 */
export async function hasConfiguredProviders(): Promise<boolean> {
    const config = await loadConfigFromDb();
    return config.providers.length > 0;
}
```

### **Step 3: Migration Logic**

Add migration function to `lib/ai/configClient.ts`:

```typescript
/**
 * Migrate localStorage config to database (one-time operation)
 */
export async function migrateLocalStorageToDb(): Promise<{ migrated: number; errors: string[] }> {
    const STORAGE_KEY = 'kr-ai-config';
    const MIGRATION_FLAG = 'kr-ai-migrated-to-db';
    
    // Check if already migrated
    if (localStorage.getItem(MIGRATION_FLAG)) {
        return { migrated: 0, errors: [] };
    }
    
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            localStorage.setItem(MIGRATION_FLAG, 'true');
            return { migrated: 0, errors: [] };
        }
        
        const config = JSON.parse(raw);
        const providers = config.providers || {};
        const errors: string[] = [];
        let migrated = 0;
        
        // Migrate each provider
        for (const [providerId, conf] of Object.entries(providers)) {
            try {
                await saveProviderConfigToDb(
                    providerId as ProviderId,
                    (conf as any).apiKey,
                    (conf as any).model,
                    (conf as any).baseUrl,
                    config.activeProvider === providerId
                );
                migrated++;
            } catch (err: any) {
                errors.push(`${providerId}: ${err.message}`);
            }
        }
        
        // Mark as migrated
        localStorage.setItem(MIGRATION_FLAG, 'true');
        
        // Optionally clear old localStorage data
        // localStorage.removeItem(STORAGE_KEY);
        
        return { migrated, errors };
    } catch (error: any) {
        return { migrated: 0, errors: [error.message] };
    }
}
```

### **Step 4: Update AISettingsPage**

File: `components/ai/AISettingsPage.tsx`

**Changes Required:**

1. **Import new functions:**
```typescript
import {
    loadConfigFromDb,
    saveProviderConfigToDb,
    deleteProviderConfigFromDb,
    setActiveProviderInDb,
    migrateLocalStorageToDb,
    type MultiAIConfig,
} from '@/lib/ai/configClient';
```

2. **Update state loading (useEffect):**
```typescript
useEffect(() => {
    async function loadData() {
        // Run migration first
        const migration = await migrateLocalStorageToDb();
        if (migration.migrated > 0) {
            console.log(`Migrated ${migration.migrated} providers to database`);
        }
        
        // Load from database
        const cfg = await loadConfigFromDb();
        setConfig(cfg);
        
        // Set first configured provider as active
        if (cfg.providers.length > 0) {
            const first = cfg.providers[0];
            setActiveProviderId(first.providerId);
            setDraftKey(first.apiKey);
            setDraftModel(first.model);
            setDraftBaseUrl(first.baseUrl || '');
        }
    }
    
    loadData();
}, []);
```

3. **Update handleSave:**
```typescript
const handleSave = async () => {
    if (!draftKey.trim()) return;
    setSaving(true);
    try {
        await saveProviderConfigToDb(
            activeProviderId,
            draftKey.trim(),
            draftModel || provider.models[0]?.id || '',
            draftBaseUrl.trim() || undefined,
            false
        );
        
        // Reload config
        const cfg = await loadConfigFromDb();
        setConfig(cfg);
        setSaved(activeProviderId);
        setTimeout(() => setSaved(null), 2500);
    } catch (error: any) {
        alert(`Gagal menyimpan: ${error.message}`);
    } finally {
        setSaving(false);
    }
};
```

4. **Update handleRemove:**
```typescript
const handleRemove = async () => {
    if (!confirm(`Hapus konfigurasi ${provider.name}?`)) return;
    try {
        await deleteProviderConfigFromDb(activeProviderId);
        const cfg = await loadConfigFromDb();
        setConfig(cfg);
        setDraftKey('');
        setDraftBaseUrl('');
    } catch (error: any) {
        alert(`Gagal menghapus: ${error.message}`);
    }
};
```

5. **Update handleSetActive:**
```typescript
const handleSetActive = async () => {
    try {
        await setActiveProviderInDb(activeProviderId, draftModel || 'auto');
        const cfg = await loadConfigFromDb();
        setConfig(cfg);
        setSaved(activeProviderId);
        setTimeout(() => setSaved(null), 2000);
    } catch (error: any) {
        alert(`Gagal set active: ${error.message}`);
    }
};
```

### **Step 5: Update Other Components**

Files that use `configuredProviders()` or `loadConfig()`:

1. **`components/ai/AIChatFloat.tsx`**
   - Replace `configuredProviders()` with async `hasConfiguredProviders()`

2. **`components/ai/AIChatCore.tsx`**
   - Update to use database config if needed

3. **`app/api/ai/chat/route.ts`**
   - Already uses `loadAllProviderConfigs()` from server ✅

---

## 🧪 Testing Checklist

- [ ] Generate AI_ENCRYPTION_KEY and add to .env.local
- [ ] Run database migration: `supabase-schema/20260526_ai_config_global.sql`
- [ ] Test API endpoints:
  - [ ] GET /api/ai/config
  - [ ] POST /api/ai/config (upsert)
  - [ ] POST /api/ai/config (delete)
  - [ ] POST /api/ai/config (setActive)
- [ ] Test migration from localStorage
- [ ] Test AISettingsPage:
  - [ ] Save provider config
  - [ ] Delete provider config
  - [ ] Set active provider
  - [ ] Test connection
- [ ] Test AI chat with database config
- [ ] Verify encryption in database (check api_key_enc column)
- [ ] Test cross-device sync (if applicable)

---

## 🔒 Security Considerations

1. **Encryption Key Management:**
   - Never commit AI_ENCRYPTION_KEY to git
   - Use different keys for dev/staging/production
   - Rotate keys periodically (requires re-encryption)

2. **API Key Masking:**
   - Client only sees masked keys (sk-••••••••1234)
   - Full keys only on server-side

3. **Database Access:**
   - No RLS (service role only)
   - API routes handle all access control

---

## 📊 Migration Impact

### **Files to Modify:**
1. `.env.example` - Add AI_ENCRYPTION_KEY
2. `lib/ai/configClient.ts` - NEW FILE (async functions)
3. `components/ai/AISettingsPage.tsx` - Major refactoring (async)
4. `components/ai/AIChatFloat.tsx` - Minor update (async check)
5. `components/ai/AIChatCore.tsx` - Minor update (if needed)

### **Estimated Effort:**
- Setup & Testing: 1-2 hours
- Code Implementation: 2-3 hours
- Testing & Debugging: 1-2 hours
- **Total: 4-7 hours**

---

## 🚀 Deployment Steps

1. **Pre-deployment:**
   - Generate AI_ENCRYPTION_KEY
   - Run database migration
   - Test in development

2. **Deployment:**
   - Add AI_ENCRYPTION_KEY to production environment
   - Deploy code changes
   - Monitor for errors

3. **Post-deployment:**
   - Verify migration runs for existing users
   - Monitor database for encrypted keys
   - Clear old localStorage data after successful migration

---

## 🆘 Rollback Plan

If issues occur:

1. **Immediate:**
   - Revert code changes
   - Users fall back to localStorage

2. **Data Recovery:**
   - localStorage data still intact (not deleted by migration)
   - Can re-run migration after fixes

3. **Database Cleanup:**
   - Delete test data: `DELETE FROM ai_provider_configs WHERE scope = 'global';`

---

## 📝 Next Steps

**Option A: Implement Now**
- I can implement all changes step-by-step
- Requires multiple file edits
- ~30-45 minutes of implementation

**Option B: Implement Later**
- Use this guide as reference
- Implement when ready
- Test thoroughly before production

**Option C: Hybrid Approach**
- Keep localStorage as fallback
- Gradually migrate users
- Dual-mode support during transition

---

**Which option would you like to proceed with?**
