import test from 'node:test'
import assert from 'node:assert/strict'
import { isExportPayload } from '../src/ipc.js'

test('isExportPayload rejects missing fields', () => {
  assert.equal(isExportPayload({}), false)
})

test('isExportPayload accepts valid payload', () => {
  assert.equal(isExportPayload({
    target: 'serato',
    setName: 'My Set',
    filePaths: ['/Users/a.mp3']
  }), true)
})
