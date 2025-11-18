#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(packageRoot, 'src')
const targetDir = path.join(srcRoot, 'components', 'ui')

const aliasResolvers = [
  {
    prefix: '@/',
    resolve: specifier => path.join(srcRoot, specifier.slice(2)),
  },
  {
    prefix: 'src/',
    resolve: specifier => path.join(srcRoot, specifier.slice(4)),
  },
]

async function main() {
  const files = await collectFiles(targetDir)
  let changedCount = 0

  await Promise.all(
    files.map(async filePath => {
      const original = await fs.readFile(filePath, 'utf8')
      const transformed = transformImports(original, filePath)

      if (transformed !== original) {
        changedCount += 1
        await fs.writeFile(filePath, transformed, 'utf8')
      }
    }),
  )

  console.log(
    changedCount > 0
      ? `Updated ${changedCount} file${changedCount === 1 ? '' : 's'} with relative imports.`
      : 'No alias-based imports found.',
  )
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(entry => {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        return collectFiles(fullPath)
      }

      return shouldProcess(fullPath) ? fullPath : []
    }),
  )

  return files.flat()
}

function shouldProcess(filePath) {
  return /\.(t|j)sx?$/.test(filePath)
}

function transformImports(source, filePath) {
  let updated = source
  const patterns = [
    /(from\s+['"])(@\/[^'"]+|src\/[^'"]+)(['"])/g,
    /(import\(['"])(@\/[^'"]+|src\/[^'"]+)(['"]\))/g,
    /(require\(['"])(@\/[^'"]+|src\/[^'"]+)(['"]\))/g,
  ]

  for (const pattern of patterns) {
    updated = updated.replace(pattern, (_, prefix, specifier, suffix) => {
      const resolved = resolveRelativeImport(specifier, filePath)
      return resolved ? `${prefix}${resolved}${suffix}` : `${prefix}${specifier}${suffix}`
    })
  }

  return updated
}

function resolveRelativeImport(specifier, filePath) {
  for (const { prefix, resolve } of aliasResolvers) {
    if (specifier.startsWith(prefix)) {
      const absoluteTarget = resolve(specifier)
      const relativePath = path.relative(path.dirname(filePath), absoluteTarget).replace(/\\/g, '/')
      if (relativePath === '') {
        return './'
      }

      return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
    }
  }

  return null
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
