(function (global) {
  'use strict';
  const T = global.Tabletop;
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    crcTable[i] = crc >>> 0;
  }
  function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  // ZIP STORE records: PNGs are already compressed. One archive avoids blocked multiple downloads.
  async function zipFiles(files) {
    if (!files.length || files.length > 65535) throw new Error('A ZIP needs 1–65,535 files.');
    const parts = [],
      directory = [],
      names = new Set(),
      encoder = new TextEncoder();
    let offset = 0,
      directorySize = 0;
    for (const file of files) {
      if (
        typeof file.name !== 'string' ||
        !file.name ||
        /[\\\x00]/.test(file.name) ||
        file.name.startsWith('/') ||
        file.name.split('/').includes('..') ||
        names.has(file.name)
      )
        throw new Error('Archive filenames must be unique relative paths.');
      names.add(file.name);
      const name = encoder.encode(file.name),
        data = new Uint8Array(await file.blob.arrayBuffer());
      if (name.length > 65535 || offset + data.length + name.length + 30 > 0xffffffff)
        throw new Error('This export exceeds the ZIP size limit. Use smaller image dimensions.');
      const crc = crc32(data),
        header = new Uint8Array(30 + name.length);
      const local = new DataView(header.buffer);
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x800, true);
      local.setUint16(12, 33, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      header.set(name, 30);
      parts.push(header, data);
      const entry = new Uint8Array(46 + name.length),
        central = new DataView(entry.buffer);
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x800, true);
      central.setUint16(14, 33, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, data.length, true);
      central.setUint32(24, data.length, true);
      central.setUint16(28, name.length, true);
      central.setUint32(42, offset, true);
      entry.set(name, 46);
      directory.push(entry);
      directorySize += entry.length;
      offset += header.length + data.length;
    }
    if (offset + directorySize + 22 > 0xffffffff)
      throw new Error('This export exceeds the ZIP size limit.');
    const end = new Uint8Array(22),
      final = new DataView(end.buffer);
    final.setUint32(0, 0x06054b50, true);
    final.setUint16(8, files.length, true);
    final.setUint16(10, files.length, true);
    final.setUint32(12, directorySize, true);
    final.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end], { type: 'application/zip' });
  }
  T.zipFiles = zipFiles;
})(globalThis);
