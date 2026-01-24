import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/lib/utils/logger'

export interface Store {
  name: string
  price: number // in cents
  url: string
  title?: string // variant-specific title from retailer
  rating?: number
  reviews?: number
  shipping?: string
}

export interface Product {
  id: string
  title: string
  price: number // in cents (lowest price)
  url: string // direct retailer link
  image?: string // primary image (first from images array)
  images?: string[] // all available product images
  retailer: string
  rating?: number
  reviews?: number
  stores?: Store[] // competing prices from other retailers
  variantTitle?: string // specific variant title if different from main title
  features?: Array<{ title: string; value: string }> // product attributes
  hasVariants?: boolean // true if product has multiple variants (experimental support)
}

interface SerpApiShoppingResult {
  title: string
  product_link?: string
  immersive_product_page_token?: string
  source: string
  price?: string
  extracted_price?: number
  thumbnail?: string
  images?: string[]
  rating?: number
  reviews?: number
}

interface SerpApiStore {
  name: string
  link: string
  title?: string
  price?: string
  extracted_price?: number
  rating?: number
  reviews?: number
  shipping?: string
}

interface SerpApiProductFeature {
  title: string
  value: string
}

interface SerpApiImmersiveProduct {
  product_results?: {
    title: string
    thumbnails?: string[]
    media?: Array<{ type: string; link: string }>
    stores?: SerpApiStore[]
    rating?: number
    reviews?: number
    price_range?: string // e.g., "$186-$267" - indicates multiple variants/options
    about_the_product?: {
      features?: SerpApiProductFeature[]
    }
    more_options?: Array<{ title: string; price?: string }>
  }
  error?: string
}

interface SerpApiResponse {
  shopping_results?: SerpApiShoppingResult[]
  error?: string
}

interface SearchOptions {
  query: string
  numResults?: number
}

interface ProductDetails {
  url: string
  stores: Store[]
  images?: string[]
  variantTitle?: string
  features?: Array<{ title: string; value: string }>
  hasVariants?: boolean // Flag to indicate product should be excluded
}

async function fetchProductDetails(
  pageToken: string,
  apiKey: string
): Promise<ProductDetails | null> {
  try {
    const params = new URLSearchParams({
      engine: 'google_immersive_product',
      page_token: pageToken,
      api_key: apiKey,
    })

    const response = await fetch(`https://serpapi.com/search.json?${params}`)
    if (!response.ok) return null

    const data: SerpApiImmersiveProduct = await response.json()

    if (data.error || !data.product_results?.stores?.length) return null

    // Detect if this product has variants
    const storeNames = data.product_results.stores.map((s) => s.name)
    const hasDuplicateStores = storeNames.length !== new Set(storeNames).size

    // Check for price_range field - canonical indicator of variants from SerpAPI
    const hasPriceRange = !!data.product_results.price_range

    // Check if any store title differs from main title (indicates variant-specific listing)
    const mainTitle = data.product_results.title?.toLowerCase() || ''
    const hasVariantTitle = data.product_results.stores.some((s) => {
      if (!s.title) return false
      const storeTitle = s.title.toLowerCase()
      // If store title is longer or different, it likely includes variant info
      return storeTitle !== mainTitle && storeTitle.length > mainTitle.length
    })

    const stores: Store[] = data.product_results.stores.map((store) => ({
      name: store.name,
      price: store.extracted_price
        ? Math.round(store.extracted_price * 100)
        : 0,
      url: store.link,
      title: store.title,
      rating: store.rating,
      reviews: store.reviews,
      shipping: store.shipping,
    }))

    // Collect all images from media array and thumbnails
    const images: string[] = []
    const mediaImages = data.product_results.media
      ?.filter((m) => m.type === 'image')
      .map((m) => m.link) || []
    images.push(...mediaImages)
    // Add thumbnails if we need more images
    if (data.product_results.thumbnails?.length) {
      for (const thumb of data.product_results.thumbnails) {
        if (!images.includes(thumb)) {
          images.push(thumb)
        }
      }
    }

    // Get variant title from first store if different from main title
    const variantTitle = stores[0]?.title

    // Get product features if available
    const features = data.product_results.about_the_product?.features?.map((f) => ({
      title: f.title,
      value: f.value,
    }))

    // Return the first store's URL as the main link
    return {
      url: stores[0]?.url || '',
      stores,
      images: images.length > 0 ? images : undefined,
      variantTitle,
      features,
      hasVariants: hasDuplicateStores || hasPriceRange || hasVariantTitle,
    }
  } catch (error) {
    logger.error('Failed to fetch product details', { error: error instanceof Error ? error.message : 'Unknown error' })
    return null
  }
}

export async function searchProducts(options: SearchOptions): Promise<Product[]> {
  const { query, numResults = 6 } = options

  logger.info('Searching products', { query })

  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey) {
    logger.error('SERPAPI_API_KEY not configured')
    throw new Error('SERPAPI_API_KEY is not configured')
  }

  // Request extra results since we'll filter out products with variants
  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: query,
    api_key: apiKey,
    num: String(Math.min(numResults * 3, 30)), // Request 3x, max 30
    hl: 'en',
    gl: 'us',
  })

  const response = await fetch(`https://serpapi.com/search.json?${params}`)

  if (!response.ok) {
    throw new Error(`SerpAPI request failed: ${response.status}`)
  }

  const data: SerpApiResponse = await response.json()

  if (data.error) {
    logger.error('SerpAPI error', { error: data.error })
    throw new Error(`SerpAPI error: ${data.error}`)
  }

  const shoppingResults = data.shopping_results || []

  // Filter valid results (don't slice yet - we'll slice at the end)
  const validResults = shoppingResults.filter((result) => {
    if (!result.extracted_price && !result.price) return false
    if (!result.title) return false
    return true
  })

  // Fetch product details in parallel to get real retailer links
  const productPromises = validResults.map(async (result): Promise<Product | null> => {
    // Use first image from images array if available, otherwise thumbnail
    const initialImage = result.images?.[0] || result.thumbnail

    const baseProduct: Product = {
      id: uuidv4(),
      title: result.title,
      price: result.extracted_price
        ? Math.round(result.extracted_price * 100)
        : 0,
      url: '', // Will be filled from immersive product
      image: initialImage,
      retailer: result.source || 'Unknown',
      rating: result.rating,
      reviews: result.reviews,
    }

    // Try to get real retailer links from immersive product API
    if (result.immersive_product_page_token) {
      const details = await fetchProductDetails(
        result.immersive_product_page_token,
        apiKey
      )
      if (details) {
        baseProduct.url = details.url
        baseProduct.stores = details.stores
        // Use images from immersive product if available
        if (details.images?.length) {
          baseProduct.images = details.images
          baseProduct.image = details.images[0]
        }
        // Add variant title and features
        if (details.variantTitle) {
          baseProduct.variantTitle = details.variantTitle
        }
        if (details.features) {
          baseProduct.features = details.features
        }
        if (details.hasVariants) {
          baseProduct.hasVariants = true
        }
        // Use the price from the first store (the one we're linking to)
        // This ensures the displayed price matches the actual product URL
        const firstStore = details.stores[0]
        if (firstStore?.price > 0) {
          baseProduct.price = firstStore.price
          baseProduct.retailer = firstStore.name
        }
      }
    }

    // Fallback to Google link if no retailer link found
    if (!baseProduct.url && result.product_link) {
      baseProduct.url = result.product_link
    }

    return baseProduct
  })

  const products = await Promise.all(productPromises)

  const validProducts = products
    .filter((p): p is Product => p !== null && !!p.url)
    .slice(0, numResults)

  return validProducts
}

export async function searchProductsByCategory(
  category: string,
  priceRange?: { min?: number; max?: number }
): Promise<Product[]> {
  let query = category

  if (priceRange?.min && priceRange?.max) {
    query += ` $${priceRange.min / 100} to $${priceRange.max / 100}`
  } else if (priceRange?.max) {
    query += ` under $${priceRange.max / 100}`
  } else if (priceRange?.min) {
    query += ` over $${priceRange.min / 100}`
  }

  return searchProducts({ query, numResults: 8 })
}
