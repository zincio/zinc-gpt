import { logger } from '@/lib/utils/logger'

/**
 * Zinc API v2 product search.
 *
 * - Cross-retailer search: GET /search?q=  (every supported retailer, results
 *   "woven" so no single store dominates; $0.01 per call from the Zinc wallet).
 *   https://www.zinc.com/docs/v2/api-reference/search/cross-retailer
 * - Retailer directory: GET /retailers (public, no auth).
 *   https://www.zinc.com/docs/v2/api-reference/retailers/list-retailers
 */

const ZINC_API_URL = 'https://api.zinc.com'
const SEARCH_TIMEOUT_MS = 20_000
const RETAILERS_TIMEOUT_MS = 10_000
const RETAILERS_TTL_MS = 6 * 60 * 60 * 1000 // 6h

export interface Product {
  /** Stable id derived from the orderable URL */
  id: string
  /** Retailer slug from Zinc, e.g. "amazon", "walmart", "kohls" */
  retailer: string
  /** Display label, e.g. "Amazon" */
  retailerName: string
  title: string
  price: number // cents
  /** Orderable retailer URL; this is what POST /orders takes */
  url: string
  image?: string
  brand?: string
  rating?: number
  reviews?: number
  available?: boolean | null
}

export interface RetailerInfo {
  retailer: string
  displayName: string
  baseUrl: string
  supportedCountries: string[]
  freeShipping: boolean
  freeShippingThresholdCents: number | null
}

interface ZincSearchResult {
  url: string
  retailer: string
  title?: string | null
  image?: string | null
  brand?: string | null
  price?: number | null
  stars?: number | null
  num_reviews?: number | null
  available?: boolean | null
}

interface ZincSearchResponse {
  status: 'completed' | 'processing' | 'failed'
  query?: string
  results?: ZincSearchResult[]
}

interface ZincRetailer {
  retailer: string
  display_name: string
  base_url: string
  supported_countries?: string[]
  free_shipping?: boolean
  free_shipping_threshold_cents?: number | null
  supported?: boolean
}

interface ZincRetailersResponse {
  retailers: ZincRetailer[]
  total: number
}

interface ZincErrorBody {
  detail?: unknown
  message?: string
  code?: string
}

export class ZincProductsError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'ZincProductsError'
  }
}

function getApiKey(): string {
  const apiKey = process.env.ZINC_API_KEY
  if (!apiKey) {
    throw new ZincProductsError('ZINC_API_KEY is not configured', 500, 'not_configured')
  }
  return apiKey
}

async function zincGet<T>(
  path: string,
  params: Record<string, string>,
  options: { timeoutMs: number; auth: boolean }
): Promise<T> {
  const search = new URLSearchParams(params)
  const response = await fetch(`${ZINC_API_URL}${path}?${search}`, {
    headers: options.auth ? { Authorization: `Bearer ${getApiKey()}` } : undefined,
    signal: AbortSignal.timeout(options.timeoutMs),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ZincErrorBody
    const detail =
      typeof body.detail === 'string'
        ? body.detail
        : body.message || (body.detail ? JSON.stringify(body.detail) : response.statusText)

    if (response.status === 402) {
      throw new ZincProductsError(
        'Zinc wallet has insufficient funds for product search. Top up at https://app.zinc.com',
        402,
        'insufficient_funds'
      )
    }
    throw new ZincProductsError(`Zinc API ${response.status}: ${detail}`, response.status, body.code)
  }

  return (await response.json()) as T
}

// ---------------------------------------------------------------------------
// Retailer directory (public, cached)
// ---------------------------------------------------------------------------

let retailersCache: { at: number; list: RetailerInfo[] } | null = null

/** Every retailer Zinc currently supports. Cached in-process for a few hours. */
export async function listRetailers(): Promise<RetailerInfo[]> {
  if (retailersCache && Date.now() - retailersCache.at < RETAILERS_TTL_MS) {
    return retailersCache.list
  }

  const data = await zincGet<ZincRetailersResponse>(
    '/retailers',
    { limit: '1000' },
    { timeoutMs: RETAILERS_TIMEOUT_MS, auth: false }
  )

  const list = (data.retailers ?? [])
    .filter((r) => r.supported !== false)
    .map((r) => ({
      retailer: r.retailer,
      displayName: r.display_name || titleCase(r.retailer),
      baseUrl: r.base_url,
      supportedCountries: r.supported_countries ?? ['US'],
      freeShipping: !!r.free_shipping,
      freeShippingThresholdCents: r.free_shipping_threshold_cents ?? null,
    }))

  retailersCache = { at: Date.now(), list }
  return list
}

function titleCase(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Display name for a retailer slug, falling back to a title-cased slug. */
export async function retailerLabel(slug: string): Promise<string> {
  try {
    const list = await listRetailers()
    return list.find((r) => r.retailer === slug)?.displayName ?? titleCase(slug)
  } catch {
    return titleCase(slug)
  }
}

// ---------------------------------------------------------------------------
// Cross-retailer search
// ---------------------------------------------------------------------------

export interface SearchOptions {
  query: string
  numResults?: number
  /** Drop products priced below this (cents). Applied server-side by Zinc. */
  minPriceCents?: number
  /** Drop products priced above this (cents). Applied server-side by Zinc. */
  maxPriceCents?: number
  /** Optional post-filter to one retailer slug (e.g. "walmart"). */
  retailer?: string
}

function productId(url: string): string {
  // FNV-1a 32-bit over the URL: stable, short, and good enough as a React key
  let hash = 0x811c9dc5
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Collapse a listing title so colour/size variants of one listing dedupe. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/**
 * Search every Zinc-supported retailer in one call.
 */
export async function searchProducts(options: SearchOptions): Promise<Product[]> {
  const { query, numResults = 6, minPriceCents, maxPriceCents, retailer } = options
  const started = Date.now()

  logger.info('Searching products', { query, minPriceCents, maxPriceCents, retailer })

  const params: Record<string, string> = { q: query }
  if (minPriceCents !== undefined) params.min_price = String(Math.max(0, Math.round(minPriceCents)))
  if (maxPriceCents !== undefined) params.max_price = String(Math.max(0, Math.round(maxPriceCents)))

  const [data, retailers] = await Promise.all([
    zincGet<ZincSearchResponse>('/search', params, { timeoutMs: SEARCH_TIMEOUT_MS, auth: true }),
    listRetailers().catch((error) => {
      logger.warn('Retailer directory unavailable, using slugs', {
        error: error instanceof Error ? error.message : String(error),
      })
      return [] as RetailerInfo[]
    }),
  ])

  if (data.status !== 'completed') {
    logger.warn('Zinc search not completed', { query, status: data.status })
    return []
  }

  const labels = new Map(retailers.map((r) => [r.retailer, r.displayName]))

  const seen = new Set<string>()
  const seenTitles = new Set<string>()
  const products: Product[] = []

  for (const r of data.results ?? []) {
    if (!r.url || !r.title || !r.price || r.price <= 0) continue
    if (r.available === false) continue
    if (retailer && r.retailer !== retailer) continue

    const id = `${r.retailer}:${productId(r.url)}`
    if (seen.has(id)) continue
    const titleKey = `${r.retailer}:${normalizeTitle(r.title)}`
    if (seenTitles.has(titleKey)) continue

    seen.add(id)
    seenTitles.add(titleKey)
    products.push({
      id,
      retailer: r.retailer,
      retailerName: labels.get(r.retailer) ?? titleCase(r.retailer),
      title: r.title,
      price: r.price,
      url: r.url,
      image: r.image || undefined,
      brand: r.brand || undefined,
      rating: r.stars ?? undefined,
      reviews: r.num_reviews ?? undefined,
      available: r.available,
    })

    if (products.length >= numResults) break
  }

  logger.info('Search complete', {
    query,
    candidates: data.results?.length ?? 0,
    returned: products.length,
    retailers: Array.from(new Set(products.map((p) => p.retailer))),
    ms: Date.now() - started,
  })

  return products
}
