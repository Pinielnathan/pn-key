/**
 * Minimal ZIP writer (method 0 / "stored", no compression — audio is already MP3-compressed,
 * and WAV barely compresses anyway, so there's nothing to gain from implementing DEFLATE).
 * Just enough of the spec for any standard unzip tool (Explorer, Finder, 7-Zip, `unzip`) to read it.
 */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

class ByteWriter {
  chunks: Uint8Array[] = [];
  length = 0;

  push(chunk: Uint8Array) {
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  u16(value: number) {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number) {
    this.push(
      new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]),
    );
  }

  bytes(data: Uint8Array) {
    this.push(data);
  }
}

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const now = dosDateTime(new Date());
  const body = new ByteWriter();
  const central = new ByteWriter();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const offset = body.length;

    body.u32(0x04034b50); // local file header signature
    body.u16(20); // version needed
    body.u16(0); // flags
    body.u16(0); // method: stored
    body.u16(now.time);
    body.u16(now.date);
    body.u32(crc);
    body.u32(entry.data.length); // compressed size
    body.u32(entry.data.length); // uncompressed size
    body.u16(nameBytes.length);
    body.u16(0); // extra field length
    body.bytes(nameBytes);
    body.bytes(entry.data);

    central.u32(0x02014b50); // central directory header signature
    central.u16(20); // version made by
    central.u16(20); // version needed
    central.u16(0); // flags
    central.u16(0); // method: stored
    central.u16(now.time);
    central.u16(now.date);
    central.u32(crc);
    central.u32(entry.data.length);
    central.u32(entry.data.length);
    central.u16(nameBytes.length);
    central.u16(0); // extra field length
    central.u16(0); // comment length
    central.u16(0); // disk number start
    central.u16(0); // internal attributes
    central.u32(0); // external attributes
    central.u32(offset);
    central.bytes(nameBytes);
  }

  const centralOffset = body.length;
  const eocd = new ByteWriter();
  eocd.u32(0x06054b50); // end of central directory signature
  eocd.u16(0); // disk number
  eocd.u16(0); // disk with central directory
  eocd.u16(entries.length); // entries on this disk
  eocd.u16(entries.length); // total entries
  eocd.u32(central.length); // central directory size
  eocd.u32(centralOffset); // central directory offset
  eocd.u16(0); // comment length

  return new Blob([...body.chunks, ...central.chunks, ...eocd.chunks] as BlobPart[], {
    type: "application/zip",
  });
}
