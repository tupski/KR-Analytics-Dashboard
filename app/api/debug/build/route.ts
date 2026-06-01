import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    return NextResponse.json({
        buildId: process.env.NEXT_PUBLIC_BUILD_ID || 'not-set',
        gitSha: process.env.NEXT_PUBLIC_GIT_SHA || 'not-set',
        buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || 'not-set',
        nodeEnv: process.env.NODE_ENV,
    })
}
