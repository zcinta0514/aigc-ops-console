import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateDataset } from './generator/build'
import { buildFiles, buildManifest, MANIFEST_NAME, sha256 } from './generator/serialize'
import { DEMO } from './generator/config'

const HERE = dirname(fileURLToPath(import.meta.url))
const OFFICIAL = resolve(join(HERE, '..', 'data', 'mock', DEMO.datasetVersion))
const TEMP = resolve(join(HERE, '..', '.tmp', 'reproducibility'))

/**
 * 在项目内临时目录重新生成一份数据，与正式数据逐字节比对。
 * 只读正式数据，不覆盖它——复现检查不应有副作用。
 */
function main() {
  rmSync(TEMP, { recursive: true, force: true })
  mkdirSync(TEMP, { recursive: true })

  const { dataset } = generateDataset()
  const files = buildFiles(dataset)
  const manifest = buildManifest(dataset, files)

  for (const [name, text] of files) writeFileSync(join(TEMP, name), text, 'utf8')
  writeFileSync(join(TEMP, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const failures: string[] = []
  for (const name of [...files.keys(), MANIFEST_NAME]) {
    let official: string
    try {
      official = readFileSync(join(OFFICIAL, name), 'utf8')
    } catch {
      failures.push(`${name}：正式数据中不存在`)
      continue
    }
    const regenerated = readFileSync(join(TEMP, name), 'utf8')
    if (official !== regenerated) {
      failures.push(`${name}：字节不一致（正式 ${sha256(official).slice(0, 12)}… vs 重生成 ${sha256(regenerated).slice(0, 12)}…）`)
    }
  }

  if (failures.length > 0) {
    console.error('复现检查未通过：')
    for (const f of failures) console.error(`  ${f}`)
    console.error('\n固定种子必须能复现出字节一致的数据。请检查生成器是否引入了 Date.now、')
    console.error('未受种子控制的随机数或依赖遍历顺序的不稳定结构。')
    process.exit(1)
  }

  console.log(`复现检查通过：种子 ${DEMO.seed} 重复生成的数据与正式数据逐字节一致（${files.size + 1} 个文件）`)
  rmSync(TEMP, { recursive: true, force: true })
}

main()
