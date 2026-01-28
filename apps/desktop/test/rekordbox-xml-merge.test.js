const test = require('node:test')
const assert = require('node:assert/strict')
const { mergeRekordboxXml } = require('../src/export/rekordboxXmlMerge')

const baseXml = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="7.x" Company="AlphaTheta"/>
  <COLLECTION Entries="1">
    <TRACK TrackID="1" Name="A" Artist="B" Location="file://localhost/tmp/a.mp3" />
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="DJ-ZOKEN"></NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`

test('mergeRekordboxXml reuses TrackID for existing Location', () => {
  const result = mergeRekordboxXml(baseXml, {
    setName: 'Set 2',
    tracks: [{ id: 'x', name: 'A', artist: 'B', location: '/tmp/a.mp3' }],
  })
  assert.ok(result.xml.includes('TrackID="1"'))
  assert.ok(result.xml.includes('Name="Set 2" Entries="1"'))
  assert.ok(result.xml.includes('<TRACK Key="1"'))
})

test('mergeRekordboxXml auto renames duplicate playlist', () => {
  const xmlWithPlaylist = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="7.x" Company="AlphaTheta"/>
  <COLLECTION Entries="0"></COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="DJ-ZOKEN">
      <NODE Type="1" Name="My Set"></NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`
  const result = mergeRekordboxXml(xmlWithPlaylist, {
    setName: 'My Set',
    tracks: [{ id: 't1', name: 'Song', artist: 'Artist', location: '/tmp/a.mp3' }],
  })
  assert.ok(result.xml.includes('Name="My Set (2)"'))
})


test('mergeRekordboxXml wraps playlists under ROOT', () => {
  const baseXml = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="7.x" Company="AlphaTheta"/>
  <COLLECTION Entries="0"></COLLECTION>
  <PLAYLISTS></PLAYLISTS>
</DJ_PLAYLISTS>
`
  const result = mergeRekordboxXml(baseXml, {
    setName: 'Set A',
    tracks: [{ id: 't1', name: 'Song', artist: 'Artist', location: '/tmp/a.mp3' }],
  })
  assert.ok(result.xml.includes('Name="ROOT"'))
  assert.ok(result.xml.includes('Name="DJ-ZOKEN"'))
})

test('mergeRekordboxXml adds Entries to existing playlists missing it', () => {
  const xmlWithPlaylist = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="7.x" Company="AlphaTheta"/>
  <COLLECTION Entries="1">
    <TRACK TrackID="1" Name="A" Artist="B" Location="file://localhost/tmp/a.mp3" />
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT">
      <NODE Type="0" Name="DJ-ZOKEN">
        <NODE Type="1" Name="Existing">
          <TRACK Key="1" />
        </NODE>
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`
  const result = mergeRekordboxXml(xmlWithPlaylist, {
    setName: 'New Set',
    tracks: [{ id: 't2', name: 'Song', artist: 'Artist', location: '/tmp/b.mp3' }],
  })
  assert.ok(result.xml.includes('Name="Existing" Entries="1"'))
  assert.ok(result.xml.includes('Name="Existing" Entries="1" KeyType="Track"'))
})

test('mergeRekordboxXml preserves existing playlist nodes with attributes', () => {
  const xmlWithPlaylist = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="7.x" Company="AlphaTheta"/>
  <COLLECTION Entries="1">
    <TRACK TrackID="1" Name="A" Artist="B" Location="file://localhost/tmp/a.mp3" />
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT">
      <NODE Type="0" Name="DJ-ZOKEN">
        <NODE Type="1" Name="Existing" Entries="1" KeyType="Track">
          <TRACK Key="1" />
        </NODE>
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`
  const result = mergeRekordboxXml(xmlWithPlaylist, {
    setName: 'New Set',
    tracks: [{ id: 't2', name: 'Song', artist: 'Artist', location: '/tmp/b.mp3' }],
  })
  assert.ok(result.xml.includes('Name="Existing" Entries="1" KeyType="Track"'))
  assert.ok(result.xml.includes('Name="New Set"'))
})

