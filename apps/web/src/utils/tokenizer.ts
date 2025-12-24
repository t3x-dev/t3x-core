import type { TextToken, SourceTextBlock, TextSelection, KeywordMarker } from '../types/nodes'

// Simple tokenizer that splits text into words and punctuation
// Handles both English and Chinese text
export function tokenizeText(text: string): TextToken[] {
  const tokens: TextToken[] = []

  // Regex to match:
  // - Newlines (preserve as separate tokens for line breaks)
  // - Chinese characters (including punctuation)
  // - English words
  // - Numbers
  // - Punctuation and whitespace (including | and │ as separators)
  const regex = /\n|[\u4e00-\u9fff]|[a-zA-Z]+|[0-9]+|[，。！？、；：""''（）《》【】]+|[.,!?;:'"()[\]{}<>|│]+|[ \t]+/g

  let match
  let index = 0

  while ((match = regex.exec(text)) !== null) {
    const tokenText = match[0]
    // Skip pure spaces/tabs but keep newlines and punctuation
    if (tokenText === '\n' || tokenText.trim() || /[，。！？、；：""''（）《》【】.,!?;:'"()[\]{}<>]/.test(tokenText)) {
      tokens.push({
        id: `token-${index}`,
        text: tokenText,
        index,
      })
      index++
    }
  }

  return tokens
}

// Create a SourceTextBlock from raw text with initial model suggestions
export function createSourceTextBlock(
  id: string,
  text: string,
  suggestedSelections?: { start: number; end: number; type?: 'include' | 'exclude' }[],
  suggestedKeywords?: { tokenIndex: number; constraint: 'must_have' | 'mustnt_have' }[]
): SourceTextBlock {
  const tokens = tokenizeText(text)

  const selections: TextSelection[] = (suggestedSelections || []).map((sel, i) => ({
    id: `sel-${id}-${i}`,
    startIndex: sel.start,
    endIndex: sel.end,
    type: sel.type || 'include',
  }))

  const keywords: KeywordMarker[] = (suggestedKeywords || []).map((kw, i) => ({
    id: `kw-${id}-${i}`,
    tokenIndex: kw.tokenIndex,
    constraint: kw.constraint,
  }))

  return {
    id,
    originalText: text,
    tokens,
    selections,
    keywords,
  }
}

// Mock model extraction based on cosine and keywords thresholds
// In production, this would call the actual ML model
export function extractWithThresholds(
  id: string,
  text: string,
  cosineThreshold: number,
  keywordsThreshold: number
): SourceTextBlock {
  const tokens = tokenizeText(text)
  if (tokens.length === 0) {
    return { id, originalText: text, tokens, selections: [], keywords: [] }
  }

  // Simulate sentence-based extraction
  // Higher cosine threshold = fewer, more relevant sentences selected
  // Lower cosine threshold = more sentences selected
  const sentenceBreaks: number[] = []
  tokens.forEach((token, idx) => {
    if (/[.!?。！？]/.test(token.text)) {
      sentenceBreaks.push(idx)
    }
  })

  // Build sentence ranges
  const sentences: { start: number; end: number }[] = []
  let sentenceStart = 0
  for (const breakIdx of sentenceBreaks) {
    if (breakIdx > sentenceStart) {
      sentences.push({ start: sentenceStart, end: breakIdx })
    }
    sentenceStart = breakIdx + 1
  }
  // Handle last sentence without period
  if (sentenceStart < tokens.length) {
    sentences.push({ start: sentenceStart, end: tokens.length - 1 })
  }

  // Select sentences based on cosine threshold (mock: higher = fewer)
  const selectRatio = 1 - cosineThreshold * 0.6 // 0.75 cosine -> 55% selected
  const numToSelect = Math.max(1, Math.ceil(sentences.length * selectRatio))

  const selections: TextSelection[] = sentences.slice(0, numToSelect).map((s, i) => ({
    id: `sel-${id}-${i}`,
    startIndex: s.start,
    endIndex: s.end,
    type: 'include' as const,
  }))

  // Extract keywords based on keywordsThreshold
  // Higher threshold = fewer but more important keywords
  const minWordLength = Math.floor(3 + keywordsThreshold * 4) // 3-7 chars
  const keywords: KeywordMarker[] = []
  let kwCount = 0
  const maxKeywords = Math.ceil((1 - keywordsThreshold) * 8) + 2 // 2-10 keywords

  for (const sel of selections) {
    for (let i = sel.startIndex; i <= sel.endIndex && kwCount < maxKeywords; i++) {
      const token = tokens[i]
      // Only consider actual words (not punctuation)
      if (/^[a-zA-Z\u4e00-\u9fff]+$/.test(token.text) && token.text.length >= minWordLength) {
        // Mock: select ~30% of qualifying words as keywords
        if (Math.random() < 0.3) {
          keywords.push({
            id: `kw-${id}-${kwCount}`,
            tokenIndex: i,
            constraint: 'must_have',
          })
          kwCount++
        }
      }
    }
  }

  return {
    id,
    originalText: text,
    tokens,
    selections,
    keywords,
  }
}

// Check if a token index is within any selection
export function isTokenInSelection(tokenIndex: number, selections: TextSelection[]): boolean {
  return selections.some(sel => tokenIndex >= sel.startIndex && tokenIndex <= sel.endIndex)
}

// Get the selection that contains a token (if any)
export function getSelectionForToken(tokenIndex: number, selections: TextSelection[]): TextSelection | undefined {
  return selections.find(sel => tokenIndex >= sel.startIndex && tokenIndex <= sel.endIndex)
}

// Check if a keyword marker is valid (within a selection)
export function isKeywordValid(keyword: KeywordMarker, selections: TextSelection[]): boolean {
  return isTokenInSelection(keyword.tokenIndex, selections)
}

// Merge overlapping selections of the same type and sort them
export function normalizeSelections(selections: TextSelection[]): TextSelection[] {
  if (selections.length === 0) return []

  // Separate by type first
  const includeSelections = selections.filter(s => s.type === 'include')
  const excludeSelections = selections.filter(s => s.type === 'exclude')

  const mergeGroup = (group: TextSelection[]): TextSelection[] => {
    if (group.length === 0) return []
    const sorted = [...group].sort((a, b) => a.startIndex - b.startIndex)
    const merged: TextSelection[] = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const last = merged[merged.length - 1]

      if (current.startIndex <= last.endIndex + 1) {
        last.endIndex = Math.max(last.endIndex, current.endIndex)
      } else {
        merged.push(current)
      }
    }
    return merged
  }

  return [...mergeGroup(includeSelections), ...mergeGroup(excludeSelections)]
}

// Add a new selection, merging with existing ones if overlapping
export function addSelection(
  selections: TextSelection[],
  startIndex: number,
  endIndex: number,
  idPrefix: string,
  type: 'include' | 'exclude' = 'include'
): TextSelection[] {
  const newSelection: TextSelection = {
    id: `sel-${idPrefix}-${Date.now()}`,
    startIndex: Math.min(startIndex, endIndex),
    endIndex: Math.max(startIndex, endIndex),
    type,
  }

  return normalizeSelections([...selections, newSelection])
}

// Remove a selection by ID
export function removeSelection(selections: TextSelection[], selectionId: string): TextSelection[] {
  return selections.filter(sel => sel.id !== selectionId)
}

// Toggle a keyword marker
export function toggleKeyword(
  keywords: KeywordMarker[],
  tokenIndex: number,
  constraint: 'must_have' | 'mustnt_have',
  idPrefix: string
): KeywordMarker[] {
  const existing = keywords.find(kw => kw.tokenIndex === tokenIndex)

  if (existing) {
    if (existing.constraint === constraint) {
      // Same constraint, remove it
      return keywords.filter(kw => kw.tokenIndex !== tokenIndex)
    } else {
      // Different constraint, update it
      return keywords.map(kw =>
        kw.tokenIndex === tokenIndex
          ? { ...kw, constraint }
          : kw
      )
    }
  } else {
    // Add new keyword
    return [...keywords, {
      id: `kw-${idPrefix}-${Date.now()}`,
      tokenIndex,
      constraint,
    }]
  }
}

// Remove keywords that are no longer in any selection
export function cleanupKeywords(keywords: KeywordMarker[], selections: TextSelection[]): KeywordMarker[] {
  return keywords.filter(kw => isTokenInSelection(kw.tokenIndex, selections))
}

// Check if token is in an include selection (not exclude)
export function isTokenInIncludeSelection(tokenIndex: number, selections: TextSelection[]): boolean {
  return selections.some(sel =>
    sel.type === 'include' && tokenIndex >= sel.startIndex && tokenIndex <= sel.endIndex
  )
}

// Check if token is in an exclude selection
export function isTokenInExcludeSelection(tokenIndex: number, selections: TextSelection[]): boolean {
  return selections.some(sel =>
    sel.type === 'exclude' && tokenIndex >= sel.startIndex && tokenIndex <= sel.endIndex
  )
}

// Get the selected text as a string (only include selections)
// Adds spaces between English words for readability
export function getSelectedText(tokens: TextToken[], selections: TextSelection[]): string {
  const includeSelections = selections.filter(s => s.type === 'include')
  const selectedTokens = tokens.filter(token => isTokenInSelection(token.index, includeSelections))

  if (selectedTokens.length === 0) return ''

  // Build text with proper spacing between English words
  let result = ''
  for (let i = 0; i < selectedTokens.length; i++) {
    const token = selectedTokens[i]
    const nextToken = selectedTokens[i + 1]

    result += token.text

    // Add space between English words
    if (nextToken) {
      const isEnglishWord = /^[a-zA-Z]+$/.test(token.text)
      const nextIsEnglishWord = /^[a-zA-Z]+$/.test(nextToken.text)
      if (isEnglishWord && nextIsEnglishWord) {
        result += ' '
      }
    }
  }

  return result
}

// Get must_have keywords as text array
export function getMustHaveKeywords(tokens: TextToken[], keywords: KeywordMarker[]): string[] {
  return keywords
    .filter(kw => kw.constraint === 'must_have')
    .map(kw => tokens[kw.tokenIndex]?.text || '')
    .filter(Boolean)
}

// Get mustnt_have keywords as text array
export function getMustntHaveKeywords(tokens: TextToken[], keywords: KeywordMarker[]): string[] {
  return keywords
    .filter(kw => kw.constraint === 'mustnt_have')
    .map(kw => tokens[kw.tokenIndex]?.text || '')
    .filter(Boolean)
}
