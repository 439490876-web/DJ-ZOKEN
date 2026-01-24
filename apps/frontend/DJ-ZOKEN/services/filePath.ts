export const getFilePath = (file: File & { path?: string }) => {
  return typeof file.path === 'string' ? file.path : null
}

export const attachFilePath = <T extends { filePath?: string | null }>(
  track: T,
  file: File & { path?: string }
): T => {
  const filePath = getFilePath(file)
  if (!filePath) {
    return track
  }
  return { ...track, filePath }
}
