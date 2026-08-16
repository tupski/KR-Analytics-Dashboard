import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// P2 security fix: restrict this endpoint to development only.
// In production, build metadata (git SHA, build ID) helps attackers
// fingerprint the exact deployment version. Return 404 to avoid
// signalling the endpoint exists at all.
export async function GET() {
    if (process.env.NODE_ENV !== 'development') {
        return new NextResponse(null, { status: 404 })
    }

    return NextResponse.json({
        buildId: process.env.NEXT_PUBLIC_BUILD_ID || 'not-set',
        gitSha: process.env.NEXT_PUBLIC_GIT_SHA || 'not-set',
        buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || 'not-set',
        nodeEnv: process.env.NODE_ENV,
    })
}
