export interface ParsedProduct {
  retailer: string
  productId: string
}

/**
 * Extract retailer and product ID from a URL.
 * Passes through to Zinc - let them handle validation.
 */
export function parseProductUrl(url: string): ParsedProduct | null {
  if (!url) return null

  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '')

    // Amazon - extract ASIN
    if (hostname.includes('amazon')) {
      const asinMatch = url.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)
      if (asinMatch) {
        // Determine region from domain
        const retailer = hostname.includes('.co.uk') ? 'amazon_uk'
          : hostname.includes('.ca') ? 'amazon_ca'
          : hostname.includes('.de') ? 'amazon_de'
          : hostname.includes('.fr') ? 'amazon_fr'
          : hostname.includes('.com.mx') ? 'amazon_mx'
          : hostname.includes('.in') ? 'amazon_in'
          : 'amazon'
        return { retailer, productId: asinMatch[1].toUpperCase() }
      }
    }

    // Walmart
    if (hostname.includes('walmart')) {
      const match = url.match(/\/ip\/(?:[^/]+\/)?(\d+)/)
      if (match) return { retailer: 'walmart', productId: match[1] }
    }

    // Best Buy
    if (hostname.includes('bestbuy')) {
      const match = url.match(/\/site\/(?:[^/]+\/)?(\d+)\.p/)
      if (match) return { retailer: 'bestbuy', productId: match[1] }
    }

    // Home Depot
    if (hostname.includes('homedepot')) {
      const match = url.match(/\/p\/(?:[^/]+\/)?(\d+)/)
      if (match) return { retailer: 'homedepot', productId: match[1] }
    }

    // Target
    if (hostname.includes('target')) {
      const match = url.match(/\/A-(\d+)/)
      if (match) return { retailer: 'target', productId: match[1] }
    }

    // Generic fallback - return URL as-is, let Zinc figure it out
    return { retailer: 'unknown', productId: url }
  } catch {
    return null
  }
}
