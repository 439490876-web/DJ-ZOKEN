import { RekordboxTrack } from './rekordboxXml'

const escapeXml = (value: string) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const toFileUrl = (path: string) => escapeXml(`file://localhost${path}`)

const parseAttributes = (tag: string) => {
  const attrs: Record<string, string> = {}
  const regex = /(\w+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(tag))) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

const extractCollectionTracks = (xml: string) => {
  const match = xml.match(/<COLLECTION[^>]*>([\s\S]*?)<\/COLLECTION>/)
  if (!match) return [] as Record<string, string>[]
  const content = match[1]
  const tracks: Record<string, string>[] = []
  const trackRegex = /<TRACK\b[^>]*?\/?>/g
  let trackMatch: RegExpExecArray | null
  while ((trackMatch = trackRegex.exec(content))) {
    const attrs = parseAttributes(trackMatch[0])
    if (!attrs.TrackID || !attrs.Location) continue
    tracks.push(attrs)
  }
  return tracks
}

const extractDjZokenBlock = (xml: string) => {
  const playlistsMatch = xml.match(/<PLAYLISTS>([\s\S]*?)<\/PLAYLISTS>/)
  if (!playlistsMatch) return ''
  const playlistsContent = playlistsMatch[1]
  const djMatch = playlistsContent.match(/<NODE Type="0" Name="DJ-ZOKEN">([\s\S]*?)<\/NODE>/)
  return djMatch ? djMatch[1] : ''
}

const extractPlaylistNodes = (djContent: string) => {
  const nodes: Array<{ name: string; xml: string }> = []
  const nodeRegex = /<NODE Type="1"[^>]*Name="([^"]+)"[^>]*>([\s\S]*?)<\/NODE>/g
  let match: RegExpExecArray | null
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

const buildTrackXml = (attrs: Record<string, string>) => {
  const parts = [
    `TrackID=\"${attrs.TrackID}\"`,
    `Name=\"${escapeXml(attrs.Name || '')}\"`,
    `Artist=\"${escapeXml(attrs.Artist || '')}\"`,
    `Location=\"${attrs.Location}\"`,
  ]
  if (attrs.Album) parts.push(`Album=\"${escapeXml(attrs.Album)}\"`)
  if (attrs.BPM) parts.push(`BPM=\"${attrs.BPM}\"`)
  if (attrs.Key) parts.push(`Key=\"${escapeXml(attrs.Key)}\"`)
  return `    <TRACK ${parts.join(' ')} />`
}

const uniquePlaylistName = (name: string, existing: Set<string>) => {
  if (!existing.has(name)) return name
  let idx = 2
  let candidate = `${name} (${idx})`
  while (existing.has(candidate)) {
    idx += 1
    candidate = `${name} (${idx})`
  }
  return candidate
}

export const mergeRekordboxXml = (baseXml: string, payload: { setName: string; tracks: RekordboxTrack[] }) => {
  const existingTracks = extractCollectionTracks(baseXml)
  const locationToId = new Map<string, string>()
  let maxId = 0
  existingTracks.forEach((attrs) => {
    const id = Number(attrs.TrackID)
    if (!Number.isNaN(id)) maxId = Math.max(maxId, id)
    locationToId.set(attrs.Location, attrs.TrackID)
  })

  const newTrackEntries: Record<string, string>[] = []
  const playlistKeys: string[] = []

  payload.tracks.forEach((track) => {
    const location = toFileUrl(track.location)
    const existingId = locationToId.get(location)
    if (existingId) {
      playlistKeys.push(existingId)
      return
    }
    maxId += 1
    const attrs: Record<string, string> = {
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
  const playlistName = uniquePlaylistName(payload.setName, existingNames)

  const playlistItems = playlistKeys.map((key) => `        <TRACK Key=\"${key}\" />`).join('\n')
  const newNode = `      <NODE Type=\"1\" Name=\"${escapeXml(playlistName)}\" Entries=\"${playlistKeys.length}\">\n${playlistItems}\n      </NODE>`

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
