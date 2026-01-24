export const getFilePath = (file) => {
  return typeof file?.path === 'string' ? file.path : null
}

export const attachFilePath = (track, file) => {
  const filePath = getFilePath(file)
  if (!filePath) {
    return track
  }
  return { ...track, filePath }
}
