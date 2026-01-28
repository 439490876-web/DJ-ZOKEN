const { buildRekordboxXml } = require('./rekordboxXml')

const escapeXml = (value) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const toFileUrl = (path) => escapeXml(`file://localhost${path}`)

const parseAttributes = (tag) => {
  const attrs = {}
  const regex = /(\w+)="([^"]*)"/g
  let match
  while ((match = regex.exec(tag))) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

const extractCollectionTracks = (xml) => {
  const collectionMatch = xml.match(/<COLLECTION[^>]*>([\s\S]*?)<\/COLLECTION>/)
  if (!collectionMatch) return []
  const content = collectionMatch[1]
  const tracks = []
  const trackRegex = /<TRACK\b[^>]*?\/?>/g
  let match
  while ((match = trackRegex.exec(content))) {
    const attrs = parseAttributes(match[0])
    if (!attrs.TrackID || !attrs.Location) continue
    tracks.push(attrs)
  }
  return tracks
}

const extractDjZokenBlock = (xml) => {
  const playlistsMatch = xml.match(/<PLAYLISTS>([\s\S]*?)<\/PLAYLISTS>/)
  if (!playlistsMatch) return ''
  const playlistsContent = playlistsMatch[1]
  const djMatch = playlistsContent.match(/<NODE Type="0" Name="DJ-ZOKEN">([\s\S]*?)<\/NODE>/)
  return djMatch ? djMatch[1] : ''
}

const extractPlaylistNodes = (djContent) => {
  const nodes = []
  const nodeRegex = /<NODE Type="1"[^>]*Name="([^"]+)"[^>]*>([\s\S]*?)<\/NODE>/g
  let match
  while ((match = nodeRegex.exec(djContent))) {
    const nodeXml = match[0]
    const trackCount = (nodeXml.match(/<TRACK\b[^>]*?\/?>/g) || []).length
    const normalized = /Entries=/.test(nodeXml)
      ? (/KeyType=/.test(nodeXml) ? nodeXml : nodeXml.replace(/<NODE Type="1" Name="([^"]+)" Entries="(\d+)">/, `<NODE Type="1" Name="$1" Entries="$2" KeyType="Track">`))
      : nodeXml.replace(
          /<NODE Type="1" Name="([^"]+)">/,
          `<NODE Type="1" Name="$1" Entries="${trackCount}" KeyType="Track">`
        )
    nodes.push({ name: match[1], xml: normalized })
  }
  return nodes
}

const buildTrackXml = (attrs) => {
  const parts = [
    `TrackID="${attrs.TrackID}"`,
    `Name="${escapeXml(attrs.Name || '')}"`,
    `Artist="${escapeXml(attrs.Artist || '')}"`,
    `Location="${attrs.Location}"`,
  ]
  if (attrs.Album) parts.push(`Album="${escapeXml(attrs.Album)}"`)
  if (attrs.BPM) parts.push(`BPM="${attrs.BPM}"`)
  if (attrs.Key) parts.push(`Key="${escapeXml(attrs.Key)}"`)
  return `    <TRACK ${parts.join(' ')} />`
}

const uniquePlaylistName = (name, existing) => {
  if (!existing.has(name)) return name
  let idx = 2
  let candidate = `${name} (${idx})`
  while (existing.has(candidate)) {
    idx += 1
    candidate = `${name} (${idx})`
  }
  return candidate
}

const mergeRekordboxXml = (baseXml, { setName, tracks }) => {
  const existingTracks = extractCollectionTracks(baseXml)
  const locationToId = new Map()
  let maxId = 0
  existingTracks.forEach((attrs) => {
    const id = Number(attrs.TrackID)
    if (!Number.isNaN(id)) maxId = Math.max(maxId, id)
    locationToId.set(attrs.Location, attrs.TrackID)
  })

  const newTrackEntries = []
  const playlistKeys = []

  tracks.forEach((track) => {
    const location = toFileUrl(track.location)
    const existingId = locationToId.get(location)
    if (existingId) {
      playlistKeys.push(existingId)
      return
    }
    maxId += 1
    const attrs = {
      TrackID: String(maxId),
      Name: track.name || '',
      Artist: track.artist || '',
      Location: location,
      Album: track.album || '',
      BPM: track.bpm != null ? String(track.bpm) : '',
      Key: track.key || '',
    }
    locationToId.set(location, attrs.TrackID)
    playlistKeys.push(attrs.TrackID)
    newTrackEntries.push(attrs)
  })

  const mergedTracks = existingTracks.concat(newTrackEntries)
  const collectionXml = mergedTracks.map(buildTrackXml).join('\n')

  const existingNodes = extractPlaylistNodes(baseXml)
  const existingNames = new Set(existingNodes.map((node) => node.name))
  const playlistName = uniquePlaylistName(setName, existingNames)

  const playlistItems = playlistKeys
    .map((key) => `        <TRACK Key="${key}" />`)
    .join('\n')
  const newNode = `      <NODE Type="1" Name="${escapeXml(playlistName)}" Entries="${playlistKeys.length}" KeyType="Track">\n${playlistItems}\n      </NODE>`

  const playlistsXml = [
    '  <PLAYLISTS>',
    '    <NODE Type="0" Name="ROOT">',
    '      <NODE Type="0" Name="DJ-ZOKEN">',
    ...existingNodes.map((node) => `        ${node.xml.replace(/\n/g, '\n        ')}`),
    newNode.replace(/^\s+/, '        '),
    '      </NODE>',
    '    </NODE>',
    '  </PLAYLISTS>',
  ].join('\n')

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DJ_PLAYLISTS Version="1.0.0">',
    '  <PRODUCT Name="rekordbox" Version="7.x" Company="AlphaTheta"/>',
    `  <COLLECTION Entries="${mergedTracks.length}">`,
    collectionXml ? collectionXml : '',
    '  </COLLECTION>',
    playlistsXml,
    '</DJ_PLAYLISTS>',
    '',
  ].join('\n')

  return { xml }
}

module.exports = {
  mergeRekordboxXml,
}
