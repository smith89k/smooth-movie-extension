// Packs only the files Chrome needs into a zip for the Chrome Web Store.
//   npm run package   ->  dist/smooth-movie-<version>.zip
// Tests, tools, docs and node_modules are left out.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { deflateRawSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['manifest.json', 'background.js', 'content', 'lib', 'popup', 'rules', 'icons'];

async function listFiles(rel) {
  const full = path.join(root, rel);
  const entries = await readdir(full, { withFileTypes: true }).catch(() => null);
  if (!entries) return [rel];
  const nested = await Promise.all(
    entries.map((e) => listFiles(path.join(rel, e.name))),
  );
  return nested.flat();
}

// A tiny zip writer (deflate, no folders entries needed).
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // utf-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0x21, 10); // fixed time/date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0x21, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const names = (await Promise.all(INCLUDE.map(listFiles))).flat().sort();
const files = await Promise.all(
  names.map(async (rel) => ({
    name: rel.split(path.sep).join('/'),
    data: await readFile(path.join(root, rel)),
  })),
);

const outDir = path.join(root, 'dist');
await mkdir(outDir, { recursive: true });
const out = path.join(outDir, `smooth-movie-${manifest.version}.zip`);
await writeFile(out, zip(files));
console.log(`Packed ${files.length} files into ${path.relative(root, out)}`);
for (const f of files) console.log(`  ${f.name}`);
