import { NextResponse } from 'next/server'
import { estimateCosts } from '@/lib/services/cost-estimator'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { productPriceCents, zipCode } = body

    // Validate inputs
    if (!productPriceCents || typeof productPriceCents !== 'number') {
      return NextResponse.json(
        { error: 'Invalid product price' },
        { status: 400 }
      )
    }

    if (!zipCode || !/^\d{5}$/.test(zipCode)) {
      return NextResponse.json(
        { error: 'Invalid zip code. Please enter a 5-digit US zip code.' },
        { status: 400 }
      )
    }

    const estimate = estimateCosts(productPriceCents, zipCode)

    if (!estimate) {
      return NextResponse.json(
        { error: 'Unable to estimate costs for this zip code' },
        { status: 400 }
      )
    }

    return NextResponse.json(estimate)
  } catch {
    return NextResponse.json(
      { error: 'Failed to calculate estimate' },
      { status: 500 }
    )
  }
}
