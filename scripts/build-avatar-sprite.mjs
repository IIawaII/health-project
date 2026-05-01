import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const AVATAR_DIR = resolve(__dirname, '../public/User')
const OUTPUT_DIR = resolve(__dirname, '../public')
const SPRITE_FILE = join(OUTPUT_DIR, 'avatar-sprite.svg')

function extractSvgContent(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const svgMatch = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)
    if (!svgMatch) return null

    const svgTag = raw.match(/<svg[^>]*>/i)?.[0] || ''
    const viewBoxMatch = svgTag.match(/viewBox="([^"]+)"/)
    const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 128 128'

    let inner = svgMatch[1].trim()
    inner = inner.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    inner = inner.replace(/<\?xml[^?]*\?>/g, '')

    const fileName = filePath.split(/[\\/]/).pop()?.replace('.svg', '') || 'unknown'

    return { id: fileName, viewBox, innerContent: inner }
  } catch {
    return null
  }
}

function scopeStyles(innerContent, prefix) {
  let result = innerContent

  const styleMatch = result.match(/<defs><style>([\s\S]*?)<\/style><\/defs>/i)
  if (!styleMatch) return result

  const css = styleMatch[1]

  const classNameMap = new Map()
  let counter = 1

  css.replace(/\.cls-(\d+)/g, (match) => {
    if (!classNameMap.has(match)) {
      classNameMap.set(match, `${prefix}-cls-${counter}`)
      counter++
    }
    return match
  })

  const sortedOriginals = [...classNameMap.keys()].sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10)
    const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10)
    return numB - numA
  })

  let scopedCss = css
  for (const original of sortedOriginals) {
    const scoped = classNameMap.get(original)
    const cssSelectorRegex = new RegExp(`\\${original}(?=[{,.:\\s])`, 'g')
    scopedCss = scopedCss.replace(cssSelectorRegex, `.${scoped}`)
  }

  let body = result.replace(styleMatch[0], `<defs><style>${scopedCss}</style></defs>`)

  const placeholderMap = new Map()
  let placeholderCounter = 0

  for (const original of sortedOriginals) {
    const scoped = classNameMap.get(original)
    const bareOriginal = original.slice(1)
    const bareScoped = scoped
    const placeholder = `__PH${placeholderCounter}__`
    placeholderCounter++
    placeholderMap.set(placeholder, bareScoped)
    const classAttrRegex = new RegExp(`(class="[^"]*?)\\b${bareOriginal}\\b([^"]*?")`, 'g')
    body = body.replace(classAttrRegex, `$1${placeholder}$2`)
  }

  for (const [placeholder, bareScoped] of placeholderMap) {
    body = body.replaceAll(placeholder, bareScoped)
  }

  return body
}

function buildSprite() {
  if (!existsSync(AVATAR_DIR)) {
    console.error(`Avatar directory not found: ${AVATAR_DIR}`)
    process.exit(1)
  }

  const files = readdirSync(AVATAR_DIR)
    .filter((f) => f.endsWith('.svg') && f.startsWith('User_'))
    .sort((a, b) => {
      const numA = parseInt(a.replace('User_', '').replace('.svg', ''), 10)
      const numB = parseInt(b.replace('User_', '').replace('.svg', ''), 10)
      return numA - numB
    })

  if (files.length === 0) {
    console.error('No SVG avatar files found')
    process.exit(1)
  }

  console.log(`Found ${files.length} avatar SVG files`)

  const symbols = []

  for (const file of files) {
    const filePath = join(AVATAR_DIR, file)
    const symbol = extractSvgContent(filePath)
    if (symbol) {
      symbol.innerContent = scopeStyles(symbol.innerContent, symbol.id)
      symbols.push(symbol)
    } else {
      console.warn(`Failed to parse: ${file}`)
    }
  }

  const defaultPath = join(AVATAR_DIR, 'default.svg')
  if (existsSync(defaultPath)) {
    const defaultSymbol = extractSvgContent(defaultPath)
    if (defaultSymbol) {
      defaultSymbol.id = 'default'
      defaultSymbol.innerContent = scopeStyles(defaultSymbol.innerContent, 'default')
      symbols.push(defaultSymbol)
    }
  }

  const spriteContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="display:none">
${symbols.map((s) => `  <symbol id="${s.id}" viewBox="${s.viewBox}">
    ${s.innerContent}
  </symbol>`).join('\n')}
</svg>`

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  writeFileSync(SPRITE_FILE, spriteContent, 'utf-8')
  console.log(`Sprite file generated: ${SPRITE_FILE}`)
  console.log(`Total symbols: ${symbols.length}`)
}

buildSprite()
