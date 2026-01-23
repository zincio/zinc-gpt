import { NextResponse } from 'next/server'
import { getStripeClient } from '@/lib/services/stripe'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
  }

  try {
    const stripe = getStripeClient()
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    return NextResponse.json({
      email: session.customer_details?.email || null,
    })
  } catch {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
}
