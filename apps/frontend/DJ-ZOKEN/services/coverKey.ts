export const buildCoverKey = (
  file: { name?: string; size?: number; lastModified?: number },
  filePath?: string | null
) => {
  const hasSignature = Boolean(file?.name) && Boolean(file?.size) && Boolean(file?.lastModified)
  if (hasSignature) {
    return `${file.name}:${file.size}:${file.lastModified}`
  }
  if (filePath) {
    return `path:${filePath}`
  }
  return null
}
