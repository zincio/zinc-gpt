interface ModerationResult {
  allowed: boolean
  reason?: string
}

// Categories of prohibited content
const PROHIBITED_CATEGORIES = {
  weapons: [
    'gun',
    'guns',
    'firearm',
    'firearms',
    'rifle',
    'rifles',
    'pistol',
    'pistols',
    'handgun',
    'handguns',
    'shotgun',
    'shotguns',
    'ammunition',
    'ammo',
    'bullet',
    'bullets',
    'weapon',
    'weapons',
    'ar-15',
    'ar15',
    'assault rifle',
    'machine gun',
    'submachine',
    'silencer',
    'suppressor',
    'holster',
    'magazine clip',
  ],
  drugs: [
    'weed',
    'marijuana',
    'cannabis',
    'cocaine',
    'heroin',
    'meth',
    'methamphetamine',
    'fentanyl',
    'opioid',
    'opioids',
    'mdma',
    'ecstasy',
    'lsd',
    'psilocybin',
    'drug paraphernalia',
    'bong',
    'crack pipe',
    'syringe',
  ],
  alcohol: [
    'alcohol',
    'beer',
    'wine',
    'whiskey',
    'vodka',
    'rum',
    'gin',
    'tequila',
    'bourbon',
    'scotch',
    'liquor',
    'spirits',
    'champagne',
    'cocktail mix',
  ],
  tobacco: [
    'cigarette',
    'cigarettes',
    'tobacco',
    'cigar',
    'cigars',
    'vape',
    'vaping',
    'e-cigarette',
    'nicotine',
    'juul',
    'hookah',
  ],
  adult: [
    'adult toy',
    'adult toys',
    'sex toy',
    'sex toys',
    'vibrator',
    'dildo',
    'pornography',
    'porn',
    'xxx',
    'adult content',
    'explicit',
    'erotic',
  ],
  prescription: [
    'prescription',
    'oxycodone',
    'oxycontin',
    'vicodin',
    'percocet',
    'xanax',
    'valium',
    'adderall',
    'ritalin',
    'ambien',
    'codeine',
    'morphine',
    'hydrocodone',
    'tramadol',
  ],
}

// Flatten all prohibited terms for quick lookup
const ALL_PROHIBITED_TERMS = Object.entries(PROHIBITED_CATEGORIES).flatMap(
  ([category, terms]) => terms.map((term) => ({ term: term.toLowerCase(), category }))
)

/**
 * Moderate a search query for prohibited content.
 * Returns whether the query is allowed and a reason if not.
 */
export function moderateSearchQuery(query: string): ModerationResult {
  if (!query || typeof query !== 'string') {
    return { allowed: true }
  }

  const normalizedQuery = query.toLowerCase().trim()

  // Check for prohibited terms
  for (const { term, category } of ALL_PROHIBITED_TERMS) {
    // Use word boundary matching to avoid false positives
    // e.g., "glass" shouldn't match "glasses"
    const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i')
    if (regex.test(normalizedQuery)) {
      return {
        allowed: false,
        reason: getCategoryMessage(category),
      }
    }
  }

  return { allowed: true }
}

/**
 * Get a user-friendly message for a prohibited category.
 */
function getCategoryMessage(category: string): string {
  const messages: Record<string, string> = {
    weapons: "I can't help search for weapons or firearms. Is there something else I can help you find?",
    drugs: "I can't help search for controlled substances. Is there something else I can help you find?",
    alcohol: "I can't help search for alcohol products. Is there something else I can help you find?",
    tobacco: "I can't help search for tobacco or vaping products. Is there something else I can help you find?",
    adult: "I can't help search for adult content. Is there something else I can help you find?",
    prescription: "I can't help search for prescription medications. Please consult your doctor or pharmacist.",
  }

  return messages[category] || "I can't help with that search. Is there something else I can help you find?"
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Check if a query contains any prohibited content.
 * Simpler version that just returns a boolean.
 */
export function isQueryAllowed(query: string): boolean {
  return moderateSearchQuery(query).allowed
}
