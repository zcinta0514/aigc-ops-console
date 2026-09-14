import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateDataset } from './generator/build'
import { checkTargets } from './generator/targets'
import { buildFiles, buildManifest, MANIFEST_NAME } from './generator/serialize'
import { validateDataset } from './validation'
import { DEMO } from './generator/config'

const HERE = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_OUT = join(HERE, '..', 'data', 'mock', DEMO.datasetVersion)

function parseOutDir(): string {
  const i = process.argv.indexOf('--out')
  if (i >= 0 && process.argv[i + 1]) return resolve(process.argv[i + 1])
  return resolve(DEFAULT_OUT)
}

function main() {
  const outDir = parseOutDir()
  const { dataset, notes } = generateDataset()

  const { errors } = validateDataset(dataset)
  if (errors.length > 0) {
    console.error(`数据校验未通过，共 ${errors.length} 条：`)
    for (const e of errors.slice(0, 25)) console.error(`  ${e}`)
    process.exit(1)
  }

  const checks = checkTargets(dataset)
  console.log('受控异常实测：')
  for (const c of checks) {
    console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.id}  ${c.label}\n        ${c.detail}`)
  }
  const failed = checks.filter(c => !c.pass)
  if (failed.length > 0) {
    console.error(`\n${failed.length} 个异常剧本未命中：${failed.map(c => c.id).join('、')}。`)
    console.error('生成器必须用配额保证命中，不得换种子碰运气。')
    process.exit(1)
  }

  const files = buildFiles(dataset)
  const manifest = buildManifest(dataset, files)

  mkdirSync(outDir, { recursive: true })
  for (const [name, text] of files) writeFileSync(join(outDir, name), text, 'utf8')
  writeFileSync(join(outDir, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  console.log(`\n数据已写入 ${outDir}`)
  for (const n of notes) console.log(`  ${n}`)
  const bytes = [...files.values()].reduce((s, t) => s + Buffer.byteLength(t), 0)
  console.log(`  数据文件合计 ${(bytes / 1024 / 1024).toFixed(2)} MB`)
}

main()
