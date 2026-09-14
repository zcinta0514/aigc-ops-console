import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Dataset } from '../src/domain/types'
import { validateDataset } from './validation'
import { buildManifest, MANIFEST_NAME, sha256 } from './generator/serialize'
import { DEMO } from './generator/config'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUT = resolve(join(HERE, '..', 'data', 'mock', DEMO.datasetVersion))

/**
 * 只校验磁盘上已有的数据，绝不顺手重新生成——否则会把数据问题"修掉"，
 * 让检查失去意义。生成是 data:generate 的职责。
 */
function main() {
  const outDir = process.argv[2] ? resolve(process.argv[2]) : resolve(DEFAULT_OUT)
  const failures: string[] = []

  const read = (name: string): unknown => {
    try {
      return JSON.parse(readFileSync(join(outDir, name), 'utf8'))
    } catch (cause) {
      failures.push(`[READ] 无法读取或解析 ${name}: ${cause instanceof Error ? cause.message : String(cause)}`)
      return undefined
    }
  }

  const dataset = {
    meta: read('meta.json'),
    sites: read('sites.json'),
    devices: read('devices.json'),
    sessions: read('sessions.json'),
    tasks: read('generation-tasks.json'),
    scans: read('scan-events.json'),
    shares: read('share-events.json'),
    incidents: read('device-incidents.json'),
  }
  if (failures.length > 0) {
    for (const f of failures) console.error(f)
    process.exit(1)
  }

  const { errors, data } = validateDataset(dataset as Dataset)
  if (errors.length > 0) {
    console.error(`数据校验未通过，共 ${errors.length} 条：`)
    for (const e of errors.slice(0, 30)) console.error(`  ${e}`)
    process.exit(1)
  }

  // manifest 完整性：记录数、哈希与固定种子必须与磁盘内容一致
  const files = new Map<string, string>()
  for (const name of ['meta.json', 'sites.json', 'devices.json', 'sessions.json',
    'generation-tasks.json', 'scan-events.json', 'share-events.json', 'device-incidents.json']) {
    files.set(name, readFileSync(join(outDir, name), 'utf8'))
  }
  const expected = buildManifest(data!, files)
  const actual = read(MANIFEST_NAME) as ReturnType<typeof buildManifest> | undefined

  if (!actual) {
    console.error(`[MANIFEST] 缺少 ${MANIFEST_NAME}`)
    process.exit(1)
  }
  if (actual.seed !== expected.seed || actual.datasetVersion !== expected.datasetVersion) {
    console.error(`[MANIFEST] 种子或数据版本不符：期望 ${expected.seed}/${expected.datasetVersion}，实际 ${actual.seed}/${actual.datasetVersion}`)
    process.exit(1)
  }
  for (const exp of expected.files) {
    const act = actual.files.find(f => f.name === exp.name)
    if (!act) { failures.push(`[MANIFEST] 缺少 ${exp.name} 的记录`); continue }
    if (act.records !== exp.records) failures.push(`[MANIFEST] ${exp.name} 记录数不符：期望 ${exp.records}，实际 ${act.records}`)
    if (act.sha256 !== sha256(files.get(exp.name)!)) failures.push(`[MANIFEST] ${exp.name} 的 SHA-256 与文件内容不符`)
  }
  if (failures.length > 0) {
    for (const f of failures) console.error(f)
    process.exit(1)
  }

  const m = data!.meta
  console.log(`数据校验通过：${outDir}`)
  console.log(`  版本 ${m.datasetVersion}，种子 ${m.seed}，观察截至 ${m.asOf}`)
  console.log(`  会话 ${data!.sessions.length}，参与者 ${new Set(data!.sessions.map(s => s.participantId)).size}`)
  console.log(`  任务 ${data!.tasks.length}，扫码 ${data!.scans.length}，分享 ${data!.shares.length}`)
  console.log(`  manifest 校验通过（${expected.files.length} 个文件）`)
}

main()
