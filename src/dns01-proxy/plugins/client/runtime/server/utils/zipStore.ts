const CRC_TABLE = new Uint32Array(256)

for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1)
  }
  CRC_TABLE[index] = value >>> 0
}

function crc32(data: Buffer) {
  let crc = ~0
  for (let index = 0; index < data.length; index += 1) {
    crc = CRC_TABLE[(crc ^ data[index]!) & 0xFF]! ^ (crc >>> 8)
  }
  return (~crc) >>> 0
}

export function createZipStore(files: Record<string, Buffer | string>) {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    const nameBuf = Buffer.from(name, 'utf8')
    const checksum = crc32(data)
    const size = data.length

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034B50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(size, 18)
    localHeader.writeUInt32LE(size, 22)
    localHeader.writeUInt16LE(nameBuf.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localParts.push(localHeader, nameBuf, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014B50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(size, 20)
    centralHeader.writeUInt32LE(size, 24)
    centralHeader.writeUInt16LE(nameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    centralParts.push(centralHeader, nameBuf)
    offset += 30 + nameBuf.length + size
  }

  const localData = Buffer.concat(localParts)
  const centralDir = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(centralDir.length, 12)
  end.writeUInt32LE(localData.length, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([localData, centralDir, end])
}

const EOCD_SIGNATURE = 0x06054B50
const CENTRAL_SIGNATURE = 0x02014B50
const LOCAL_SIGNATURE = 0x04034B50

function basenameFromZipPath(name: string) {
  const normalized = normalizeZipPath(name)
  const base = normalized.split('/').pop() || ''
  if (!base || base === '.' || base === '..') {
    return ''
  }
  return base
}

function normalizeZipPath(name: string) {
  return name.replace(/\\/g, '/').replace(/^\/+/, '')
}

function isSafeZipPath(path: string) {
  const normalized = normalizeZipPath(path)
  if (!normalized || normalized.includes('..')) {
    return false
  }
  return normalized.split('/').every(part => part && part !== '.' && part !== '..')
}

function readZipEntryData(
  buffer: Buffer,
  entryName: string,
  method: number,
  compressedSize: number,
  localOffset: number,
) {
  if (method !== 0) {
    throw new Error(
      `ZIP entry "${entryName}" is compressed; upload an uncompressed export (use Download from this UI)`,
    )
  }

  if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
    throw new Error(`Invalid ZIP local header for ${entryName}`)
  }

  const localNameLength = buffer.readUInt16LE(localOffset + 26)
  const localExtraLength = buffer.readUInt16LE(localOffset + 28)
  const dataStart = localOffset + 30 + localNameLength + localExtraLength
  const dataEnd = dataStart + compressedSize

  if (dataEnd > buffer.length) {
    throw new Error(`ZIP entry "${entryName}" is truncated`)
  }

  return Buffer.from(buffer.subarray(dataStart, dataEnd))
}

/** Read an uncompressed (store) ZIP keyed by full entry path. */
export function parseZipStorePaths(buffer: Buffer): Record<string, Buffer> {
  if (buffer.length < 22) {
    throw new Error('ZIP file is too small')
  }

  let eocdOffset = -1
  const searchStart = Math.max(0, buffer.length - 65557)
  for (let index = buffer.length - 22; index >= searchStart; index -= 1) {
    if (buffer.readUInt32LE(index) === EOCD_SIGNATURE) {
      eocdOffset = index
      break
    }
  }

  if (eocdOffset < 0) {
    throw new Error('ZIP end of central directory not found')
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10)
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16)
  const files: Record<string, Buffer> = {}
  let position = centralOffset

  for (let entry = 0; entry < totalEntries; entry += 1) {
    if (buffer.readUInt32LE(position) !== CENTRAL_SIGNATURE) {
      throw new Error('Invalid ZIP central directory')
    }

    const method = buffer.readUInt16LE(position + 10)
    const compressedSize = buffer.readUInt32LE(position + 20)
    const nameLength = buffer.readUInt16LE(position + 28)
    const extraLength = buffer.readUInt16LE(position + 30)
    const commentLength = buffer.readUInt16LE(position + 32)
    const localOffset = buffer.readUInt32LE(position + 42)
    const entryName = buffer.subarray(position + 46, position + 46 + nameLength).toString('utf8')
    position += 46 + nameLength + extraLength + commentLength

    const normalized = normalizeZipPath(entryName)
    if (!isSafeZipPath(normalized)) {
      continue
    }

    files[normalized] = readZipEntryData(buffer, entryName, method, compressedSize, localOffset)
  }

  return files
}

/** Group batch ZIP paths as `{ certName: { pemName: data } }`. */
export function groupZipCertFolders(paths: Record<string, Buffer>) {
  const folders: Record<string, Record<string, Buffer>> = {}

  for (const [path, data] of Object.entries(paths)) {
    const parts = normalizeZipPath(path).split('/').filter(Boolean)
    if (parts.length < 2) {
      continue
    }

    const certName = parts[0]!
    const pemName = parts[parts.length - 1]!
    folders[certName] ??= {}
    folders[certName][pemName] = data
  }

  return folders
}

/** Read an uncompressed (store) ZIP — flat map by PEM basename (single-cert exports). */
export function parseZipStore(buffer: Buffer): Record<string, Buffer> {
  const paths = parseZipStorePaths(buffer)
  const files: Record<string, Buffer> = {}

  for (const [path, data] of Object.entries(paths)) {
    const baseName = basenameFromZipPath(path)
    if (baseName) {
      files[baseName] = data
    }
  }

  return files
}
