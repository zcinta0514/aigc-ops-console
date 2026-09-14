import { mkdir, copyFile, stat } from 'node:fs/promises'
await mkdir('deliverables', { recursive: true })
await copyFile('dist-single/index.html', 'deliverables/aigc-ops-dashboard.single.html')
console.log(`Single HTML: ${(await stat('dist-single/index.html')).size} bytes`)
