import { describe, it, expect } from 'vitest'
import { moderateSearchQuery } from '../content-filter'

describe('Content Moderation', () => {
  describe('should BLOCK prohibited searches', () => {
    // Drugs
    it('blocks "buy me weed"', () => {
      const result = moderateSearchQuery('buy me weed')
      expect(result.allowed).toBe(false)
    })

    it('blocks "marijuana edibles"', () => {
      const result = moderateSearchQuery('marijuana edibles')
      expect(result.allowed).toBe(false)
    })

    it('blocks "cocaine"', () => {
      const result = moderateSearchQuery('cocaine')
      expect(result.allowed).toBe(false)
    })

    it('blocks "buy xanax online"', () => {
      const result = moderateSearchQuery('buy xanax online')
      expect(result.allowed).toBe(false)
    })

    // Weapons
    it('blocks "buy a gun"', () => {
      const result = moderateSearchQuery('buy a gun')
      expect(result.allowed).toBe(false)
    })

    it('blocks "ar-15 rifle"', () => {
      const result = moderateSearchQuery('ar-15 rifle')
      expect(result.allowed).toBe(false)
    })

    it('blocks "9mm ammo"', () => {
      const result = moderateSearchQuery('9mm ammo')
      expect(result.allowed).toBe(false)
    })

    it('blocks "handgun holster"', () => {
      const result = moderateSearchQuery('handgun holster')
      expect(result.allowed).toBe(false)
    })

    // Alcohol
    it('blocks "vodka"', () => {
      const result = moderateSearchQuery('vodka')
      expect(result.allowed).toBe(false)
    })

    it('blocks "buy whiskey"', () => {
      const result = moderateSearchQuery('buy whiskey')
      expect(result.allowed).toBe(false)
    })

    it('blocks "craft beer"', () => {
      const result = moderateSearchQuery('craft beer')
      expect(result.allowed).toBe(false)
    })

    // Tobacco
    it('blocks "cigarettes"', () => {
      const result = moderateSearchQuery('cigarettes')
      expect(result.allowed).toBe(false)
    })

    it('blocks "vape pen"', () => {
      const result = moderateSearchQuery('vape pen')
      expect(result.allowed).toBe(false)
    })

    it('blocks "juul pods"', () => {
      const result = moderateSearchQuery('juul pods')
      expect(result.allowed).toBe(false)
    })

    // Adult content
    it('blocks "adult toys"', () => {
      const result = moderateSearchQuery('adult toys')
      expect(result.allowed).toBe(false)
    })
  })

  describe('should ALLOW normal product searches', () => {
    it('allows "wireless headphones"', () => {
      const result = moderateSearchQuery('wireless headphones')
      expect(result.allowed).toBe(true)
    })

    it('allows "running shoes"', () => {
      const result = moderateSearchQuery('running shoes')
      expect(result.allowed).toBe(true)
    })

    it('allows "coffee maker"', () => {
      const result = moderateSearchQuery('coffee maker')
      expect(result.allowed).toBe(true)
    })

    it('allows "laptop stand"', () => {
      const result = moderateSearchQuery('laptop stand')
      expect(result.allowed).toBe(true)
    })

    it('allows "kids toys"', () => {
      const result = moderateSearchQuery('kids toys')
      expect(result.allowed).toBe(true)
    })

    it('allows "garden hose"', () => {
      const result = moderateSearchQuery('garden hose')
      expect(result.allowed).toBe(true)
    })

    it('allows "reading glasses"', () => {
      const result = moderateSearchQuery('reading glasses')
      expect(result.allowed).toBe(true)
    })
  })

  describe('returns helpful error messages', () => {
    it('returns message about weapons for gun queries', () => {
      const result = moderateSearchQuery('buy a gun')
      expect(result.reason).toContain('weapons')
    })

    it('returns message about alcohol for beer queries', () => {
      const result = moderateSearchQuery('beer')
      expect(result.reason).toContain('alcohol')
    })

    it('returns message about drugs for drug queries', () => {
      const result = moderateSearchQuery('cocaine')
      expect(result.reason).toContain('controlled substances')
    })
  })
})
