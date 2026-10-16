function fail(message: string): never {
  throw new Error(`GLB: ${message}`);
}
/** Validated GLB envelope; shared by geometry parsing and browser image decoding. */
export function readGlbContainer(buffer: ArrayBuffer): {
  document: unknown;
  binary: DataView | undefined;
} {
  const data = new DataView(buffer);
  if (
    buffer.byteLength < 20 ||
    data.getUint32(0, true) !== 0x46546c67 ||
    data.getUint32(4, true) !== 2 ||
    data.getUint32(8, true) !== buffer.byteLength
  )
    fail('invalid header or length');
  let offset = 12,
    json: unknown,
    binary: DataView | undefined,
    chunk = 0;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) fail('truncated chunk header');
    const length = data.getUint32(offset, true),
      type = data.getUint32(offset + 4, true);
    offset += 8;
    if (length % 4 || offset + length > buffer.byteLength)
      fail('invalid chunk bounds');
    if (chunk === 0 && type !== 0x4e4f534a) fail('JSON must be first');
    if (type === 0x4e4f534a) {
      if (chunk !== 0) fail('duplicate JSON chunk');
      json = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          new Uint8Array(buffer, offset, length),
        ),
      ) as unknown;
    } else if (type === 0x004e4942) {
      if (binary || chunk !== 1) fail('BIN must be second');
      binary = new DataView(buffer, offset, length);
    }
    offset += length;
    chunk++;
  }
  return { document: json, binary };
}
