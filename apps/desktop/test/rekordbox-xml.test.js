const test = require('node:test')
const assert = require('node:assert/strict')

const { buildRekordboxXml } = require('../src/export/rekordboxXml')

test('buildRekordboxXml writes collection and playlist nodes', () => {
  const xml = buildRekordboxXml({
    setName: 'Test Set',
    tracks: [
      { id: 't1', name: 'Song A', artist: 'Artist A', location: '/tmp/a.mp3' },
      { id: 't2', name: 'Song B', artist: 'Artist B', location: '/tmp/b.mp3' },
    ],
  })
  assert.ok(xml.includes('<COLLECTION'))
  assert.ok(xml.includes('TrackID="1"'))
  assert.ok(xml.includes('Location="file://'))
  assert.ok(xml.includes('<NODE Type="1" Name="Test Set"'))
  assert.ok(xml.includes('<TRACK Key="1"'))
  assert.ok(xml.includes('Name="Test Set" Entries="2"'))
  assert.ok(xml.includes('KeyType="Track"'))
})


test('buildRekordboxXml escapes ampersand in location', () => {
  const xml = buildRekordboxXml({
    setName: 'Test Set',
    tracks: [
      {
        id: 't1',
        name: 'Song A',
        artist: 'Artist A',
        location: '/Music/ACDC & Friends.mp3',
      },
    ],
  })
  assert.ok(xml.includes('Location="file://localhost/Music/ACDC &amp; Friends.mp3"'))
})


test('buildRekordboxXml uses localhost location with utf8 path', () => {
  const xml = buildRekordboxXml({
    setName: 'Test Set',
    tracks: [
      {
        id: 't1',
        name: 'Song A',
        artist: 'Artist A',
        location: '/Users/apple/work/112teset/连麻Swimming,RICHNOMADIC - 漫长的季节.flac',
      },
    ],
  })
  assert.ok(
    xml.includes(
      'Location="file://localhost/Users/apple/work/112teset/连麻Swimming,RICHNOMADIC - 漫长的季节.flac"'
    )
  )
})
