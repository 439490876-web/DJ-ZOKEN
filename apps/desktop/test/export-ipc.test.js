const test = require('node:test')
const assert = require('node:assert/strict')
const { createExportHandler } = require('../src/ipc')

test('export handler returns ok result', async () => {
  const handler = createExportHandler(async () => ({ ok: true, message: 'ok' }))
  const result = await handler(null, { target: 'serato', setName: 'My Set', filePaths: ['/a.mp3'] })
  assert.deepEqual(result, { ok: true, message: 'ok' })
})

test('export handler validates payload', async () => {
  const handler = createExportHandler(async () => ({ ok: true, message: 'ok' }))
  const result = await handler(null, { target: 'bad', setName: 'My Set', filePaths: [] })
  assert.equal(result.ok, false)
})
