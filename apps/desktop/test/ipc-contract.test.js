const test = require('node:test')
const assert = require('node:assert/strict')
const { isExportPayload } = require('../src/ipc')

test('isExportPayload rejects missing fields', () => {
  assert.equal(isExportPayload({}), false)
})

test('isExportPayload accepts valid payload', () => {
  assert.equal(
    isExportPayload({
      target: 'serato',
      setName: 'My Set',
      filePaths: ['/Users/a.mp3'],
    }),
    true
  )
})
