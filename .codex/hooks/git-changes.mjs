import { execFileSync } from 'node:child_process'

export function parsePorcelainZ(output) {
  const records = output.split('\0')
  const paths = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record) continue
    if (record.length < 4 || record[2] !== ' ') {
      throw new Error(`unexpected git status record: ${JSON.stringify(record)}`)
    }

    const status = record.slice(0, 2)
    paths.push(record.slice(3))
    if (/[RC]/.test(status)) {
      const originalPath = records[index + 1]
      if (!originalPath) throw new Error('rename/copy status is missing its original path')
      paths.push(originalPath)
      index += 1
    }
  }
  return [...new Set(paths)]
}

export function listChangedPaths(cwd = process.cwd()) {
  const output = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return parsePorcelainZ(output)
}
