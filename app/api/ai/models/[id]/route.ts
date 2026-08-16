/**
 * API Route for updating individual AI Provider Models
 * 
 * PATCH /api/ai/models/[id] - Update model enabled status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { UpdateModelResponse, ProviderModel } from '@/types/ai-models';
import { requireAdmin, isGuardError } from '@/lib/security/guard';

/**
 * PATCH /api/ai/models/[id]
 * 
 * Update model enabled status
 * 
 * Request body:
 *   - enabled: boolean
 * 
 * Returns:
 *   - success: boolean
 *   - model?: ProviderModel
 *   - error?: string
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Admin guard — re-validates session and super_admin role server-side.
        const guard = await requireAdmin();
        if (isGuardError(guard)) return guard;

        const supabase = createServerClient();

        // Resolve params (Next.js 15: params is a Promise)
        const resolvedParams = await params;

        // Parse model ID
        const modelId = parseInt(resolvedParams.id, 10);
        if (isNaN(modelId)) {
            return NextResponse.json(
                { success: false, error: 'Invalid model ID' },
                { status: 400 }
            );
        }

        // Parse request body
        const body = await request.json();
        const { enabled } = body;

        if (typeof enabled !== 'boolean') {
            return NextResponse.json(
                { success: false, error: 'enabled must be a boolean' },
                { status: 400 }
            );
        }

        // Update model in database
        const { data: updatedModel, error: updateError } = await supabase
            .from('ai_provider_models')
            .update({ enabled })
            .eq('id', modelId)
            .select()
            .single();

        if (updateError) {
            console.error('[PATCH /api/ai/models/[id]] Update error:', updateError);
            return NextResponse.json(
                { success: false, error: 'Gagal mengupdate model' },
                { status: 500 }
            );
        }

        if (!updatedModel) {
            return NextResponse.json(
                { success: false, error: 'Model tidak ditemukan' },
                { status: 404 }
            );
        }

        // Convert database format to ProviderModel format
        const providerModel: ProviderModel = {
            id: updatedModel.id,
            providerSlug: updatedModel.provider_slug,
            providerName: updatedModel.provider_name,
            modelId: updatedModel.model_id,
            displayName: updatedModel.display_name,
            enabled: updatedModel.enabled,
            capabilities: updatedModel.capabilities,
            pricing: updatedModel.pricing,
            raw: updatedModel.raw,
            lastFetchedAt: updatedModel.last_fetched_at,
            createdAt: updatedModel.created_at,
            updatedAt: updatedModel.updated_at,
        };

        console.log(`[PATCH /api/ai/models/[id]] Updated model ${modelId}: enabled=${enabled}`);

        const response: UpdateModelResponse = {
            success: true,
            model: providerModel,
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('[PATCH /api/ai/models/[id]] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
