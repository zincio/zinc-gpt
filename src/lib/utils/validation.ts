import { z } from 'zod'

export const emailSchema = z.string().email('Please enter a valid email address')

export const addressSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  addressLine1: z.string().min(1, 'Address is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().length(2, 'Use 2-letter state code'),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
  country: z.string().default('US'),
  phoneNumber: z.string().regex(/^\+?[\d\s-()]{10,}$/, 'Invalid phone number').optional(),
})

export const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number(),
  url: z.string().url(),
  image: z.string().url().optional(),
  retailer: z.string(),
  rating: z.number().optional(),
  reviewCount: z.number().optional(),
  description: z.string().optional(),
  asin: z.string().optional(),
})

export const cartItemSchema = z.object({
  product: productSchema,
  quantity: z.number().int().positive(),
})

export const shippingOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
  estimatedDays: z.string(),
})

export type Email = z.infer<typeof emailSchema>
export type Address = z.infer<typeof addressSchema>
export type Product = z.infer<typeof productSchema>
export type CartItem = z.infer<typeof cartItemSchema>
export type ShippingOption = z.infer<typeof shippingOptionSchema>
