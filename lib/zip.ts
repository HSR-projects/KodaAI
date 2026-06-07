/**
 * Minimal, dependency-free ZIP writer (STORE method — no compression).
 *
 * Used by Koda's Computer to package a generated project for download. STORE
 * produces a fully valid .zip that every OS/unzip tool reads; we skip DEFLATE
 * to avoid pulling in a compression library for what are small text projects.
 */

const crcTable: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface Entry {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}

/** DOS time/date for "now" — most tools ignore the value but expect the field. */
function dosDateTime(): { time: number; date: number } {
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function writeU16(arr: number[], v: number) {
  arr.push(v & 0xff, (v >>> 8) & 0xff);
}
function writeU32(arr: number[], v: number) {
  arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}

/** Build a ZIP Blob from a set of files. Paths use "/" separators. */
export function zipFiles(files: { path: string; content: string }[]): Blob {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime();
  const chunks: Uint8Array[] = [];
  const entries: Entry[] = [];
  let offset = 0;

  // ── Local file headers + data ──────────────────────────────
  for (const f of files) {
    const nameBytes = encoder.encode(f.path.replace(/^\/+/, ""));
    const data = encoder.encode(f.content);
    const crc = crc32(data);
    entries.push({ nameBytes, data, crc, offset });

    const header: number[] = [];
    writeU32(header, 0x04034b50); // local file header signature
    writeU16(header, 20); // version needed
    writeU16(header, 0x0800); // flags: bit 11 = UTF-8 filename
    writeU16(header, 0); // method: 0 = store
    writeU16(header, time);
    writeU16(header, date);
    writeU32(header, crc);
    writeU32(header, data.length); // compressed size (== uncompressed for store)
    writeU32(header, data.length); // uncompressed size
    writeU16(header, nameBytes.length);
    writeU16(header, 0); // extra field length

    const headerBytes = new Uint8Array(header);
    chunks.push(headerBytes, nameBytes, data);
    offset += headerBytes.length + nameBytes.length + data.length;
  }

  // ── Central directory ──────────────────────────────────────
  const cdStart = offset;
  for (const e of entries) {
    const cd: number[] = [];
    writeU32(cd, 0x02014b50); // central dir header signature
    writeU16(cd, 20); // version made by
    writeU16(cd, 20); // version needed
    writeU16(cd, 0x0800); // flags
    writeU16(cd, 0); // method
    writeU16(cd, time);
    writeU16(cd, date);
    writeU32(cd, e.crc);
    writeU32(cd, e.data.length);
    writeU32(cd, e.data.length);
    writeU16(cd, e.nameBytes.length);
    writeU16(cd, 0); // extra
    writeU16(cd, 0); // comment
    writeU16(cd, 0); // disk number
    writeU16(cd, 0); // internal attrs
    writeU32(cd, 0); // external attrs
    writeU32(cd, e.offset);

    const cdBytes = new Uint8Array(cd);
    chunks.push(cdBytes, e.nameBytes);
    offset += cdBytes.length + e.nameBytes.length;
  }
  const cdSize = offset - cdStart;

  // ── End of central directory ───────────────────────────────
  const eocd: number[] = [];
  writeU32(eocd, 0x06054b50);
  writeU16(eocd, 0); // disk
  writeU16(eocd, 0); // disk with cd
  writeU16(eocd, entries.length);
  writeU16(eocd, entries.length);
  writeU32(eocd, cdSize);
  writeU32(eocd, cdStart);
  writeU16(eocd, 0); // comment length
  chunks.push(new Uint8Array(eocd));

  return new Blob(chunks as BlobPart[], { type: "application/zip" });
}

/** Trigger a browser download of the given files as <name>.zip. */
export function downloadZip(name: string, files: { path: string; content: string }[]) {
  const blob = zipFiles(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "project"}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
