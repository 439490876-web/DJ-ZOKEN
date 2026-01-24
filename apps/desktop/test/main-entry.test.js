const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.join(__dirname, '..')
const pkg = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
)

test('electron main entry exists', () => {
  const mainPath = path.join(rootDir, pkg.main || '')
  assert.equal(Boolean(pkg.main), true)
  assert.equal(fs.existsSync(mainPath), true)
})
