/**
 * Local curated prompt library
 * Data source: nanobanana-trending-prompts (1300+ high-quality curated prompts)
 * Loads data/trending-prompts.json, provides search and random browse features
 */

import { readFileSync } from 'fs'
import { join } from 'path'

// ============================================================
// Types
// ============================================================

export interface TrendingPrompt {
  rank: number
  id: string
  prompt: string
  author: string
  author_name: string
  likes: number
  views: number
  image: string
  images: string[]
  model: string
  categories: string[]
  rating?: number
  score?: number
  date: string
  source_url: string
}

export type PromptCategory =
  | 'Photography'
  | 'Illustration & 3D'
  | 'Product & Brand'
  | 'Food & Drink'
  | 'Poster Design'
  | 'UI & Graphic'

export const ALL_CATEGORIES: PromptCategory[] = [
  'Photography',
  'Illustration & 3D',
  'Product & Brand',
  'Food & Drink',
  'Poster Design',
  'UI & Graphic',
]

/** Map legacy DB values → display names. Data files now ship with new names already; this map only protects against stale legacy data. */
const CATEGORY_DISPLAY_MAP: Record<string, PromptCategory> = {
  '3D': 'Illustration & 3D',
  'Food': 'Food & Drink',
  'Photograph': 'Photography',
  'Product': 'Product & Brand',
  'Poster': 'Poster Design',
  'Design': 'UI & Graphic',
}

/** Convert legacy category name to display name; returns the input unchanged if it's not a known legacy alias. */
export function mapCategory(raw: string): string {
  return CATEGORY_DISPLAY_MAP[raw] || raw
}

// ============================================================
// Data Loading (lazy, singleton)
// ============================================================

let _prompts: TrendingPrompt[] | null = null

function getDataPath(): string {
  // dist/lib/prompt-library.js -> up two levels to dist/, then to project root data/
  // Compatible with both src/ dev mode and dist/ compiled mode
  const currentDir = __dirname
  // From dist/lib/ or src/lib/ up to project root
  const projectRoot = join(currentDir, '..', '..')
  return join(projectRoot, 'data', 'trending-prompts.json')
}

function loadPrompts(): TrendingPrompt[] {
  if (_prompts) return _prompts
  try {
    const content = readFileSync(getDataPath(), 'utf-8')
    const raw = JSON.parse(content) as TrendingPrompt[]
    // Map legacy DB category names to new display names
    _prompts = raw.map(p => ({
      ...p,
      categories: p.categories.map(mapCategory),
    }))
    return _prompts
  } catch (e) {
    console.error('Failed to load trending prompts:', e)
    _prompts = []
    return _prompts
  }
}

// ============================================================
// Search & Browse
// ============================================================

export interface SearchOptions {
  query?: string
  category?: string
  limit?: number
  offset?: number
  sortBy?: 'rank' | 'likes' | 'views' | 'date'
}

/**
 * Search the curated prompt library.
 * Supports keyword search (matches prompt text, author name, categories) + category filtering.
 */
export function searchPrompts(options: SearchOptions): TrendingPrompt[] {
  const prompts = loadPrompts()
  const { query, category, limit = 10, offset = 0, sortBy = 'rank' } = options

  let filtered = prompts

  // Category filter
  if (category) {
    const cat = category.toLowerCase()
    filtered = filtered.filter(p =>
      p.categories.some(c => c.toLowerCase() === cat)
    )
  }

  // Keyword search
  if (query && query.trim()) {
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean)
    filtered = filtered.map(p => {
      const searchText = [
        p.prompt,
        p.author_name,
        p.author,
        ...p.categories,
      ].join(' ').toLowerCase()

      // Calculate match score
      let score = 0
      for (const kw of keywords) {
        if (searchText.includes(kw)) {
          score += 1
          // Higher score for prompt text match
          if (p.prompt.toLowerCase().includes(kw)) score += 2
          // Higher score for category match
          if (p.categories.some(c => c.toLowerCase().includes(kw))) score += 3
        }
      }
      return { prompt: p, score }
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score || a.prompt.rank - b.prompt.rank)
    .map(r => r.prompt)
  } else {
    // No keyword — sort by specified field
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'likes': return b.likes - a.likes
        case 'views': return b.views - a.views
        case 'date': return b.date.localeCompare(a.date)
        case 'rank':
        default: return a.rank - b.rank
      }
    })
  }

  return filtered.slice(offset, offset + limit)
}

/** Get a single prompt by ID */
export function getPromptById(id: string): TrendingPrompt | null {
  const prompts = loadPrompts()
  return prompts.find(p => p.id === id) || null
}

/** Get random curated prompts */
export function getRandomPrompts(count: number, category?: string): TrendingPrompt[] {
  const prompts = loadPrompts()
  let pool = prompts

  if (category) {
    const cat = category.toLowerCase()
    pool = pool.filter(p => p.categories.some(c => c.toLowerCase() === cat))
  }

  // Fisher-Yates shuffle on a copy, take first N
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled.slice(0, count)
}

/** Get library statistics */
export function getLibraryStats(): { total: number; categories: Record<string, number> } {
  const prompts = loadPrompts()
  const categories: Record<string, number> = {}
  for (const p of prompts) {
    for (const c of p.categories) {
      categories[c] = (categories[c] || 0) + 1
    }
  }
  return { total: prompts.length, categories }
}
