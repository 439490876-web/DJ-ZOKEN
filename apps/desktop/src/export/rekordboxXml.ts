export type RekordboxTrack = {
  id: string
  name: string
  artist: string
  album?: string | null
  bpm?: number | null
  key?: string | null
  location: string
}

type BuildInput = {
  setName: string
  tracks: RekordboxTrack[]
}

const escapeXml = (value: string) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const toFileUrl = (path: string) => escapeXml(`file://localhost${path}`)

export const buildRekordboxXml = ({ setName, tracks }: BuildInput): string => {
  const collection = tracks
    .map((track, idx) => {
      const trackId = idx + 1
      const attrs = [
        `TrackID=\"${trackId}\"`,
        `Name=\"${escapeXml(track.name)}\"`,
        `Artist=\"${escapeXml(track.artist)}\"`,
        `Location=\"${toFileUrl(track.location)}\"`,
      ]
      if (track.album) attrs.push(`Album=\"${escapeXml(track.album)}\"`)
      if (typeof track.bpm === 'number') attrs.push(`BPM=\"${track.bpm}\"`)
      if (track.key) attrs.push(`Key=\"${escapeXml(track.key)}\"`)
      return `    <TRACK ${attrs.join(' ')} />`
    })
    .join('\n')

  const playlistItems = tracks
    .map((_, idx) => `        <TRACK Key=\"${idx + 1}\" />`)
    .join('\n')

  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<DJ_PLAYLISTS Version=\"1.0.0\">\n  <PRODUCT Name=\"rekordbox\" Version=\"7.x\" Company=\"AlphaTheta\"/>\n  <COLLECTION Entries=\"${tracks.length}\">\n${collection}\n  </COLLECTION>\n  <PLAYLISTS>
    <NODE Type="0" Name="ROOT">
      <NODE Type="0" Name="DJ-ZOKEN">
        <NODE Type="1" Name="${escapeXml(setName)}" Entries="${tracks.length}" KeyType="Track">
${playlistItems}
        </NODE>
      </NODE>
    </NODE>
  </PLAYLISTS>\n</DJ_PLAYLISTS>\n`
}
