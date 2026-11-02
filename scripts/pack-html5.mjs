import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apps = ['my-purchase-requests', 'approvals', 'approval-rules']
const resources = path.join(root, 'gen', 'html5', 'resources')

rmSync(path.join(root, 'gen', 'html5'), { recursive: true, force: true })
mkdirSync(resources, { recursive: true })

for (const app of apps) {
  const source = path.join(root, 'app', app)
  const stage = path.join(root, 'gen', 'html5', 'staging', app)
  mkdirSync(stage, { recursive: true })
  cpSync(path.join(source, 'webapp'), stage, { recursive: true })
  cpSync(path.join(source, 'xs-app.json'), path.join(stage, 'xs-app.json'))
  const manifest = JSON.parse(readFileSync(path.join(stage, 'manifest.json'), 'utf8'))
  const zipName = `${manifest['sap.app'].id}.zip`
  execFileSync('zip', ['-qr', path.join(resources, zipName), '.'], { cwd: stage })
  console.log(`packed gen/html5/resources/${zipName}`)
}
