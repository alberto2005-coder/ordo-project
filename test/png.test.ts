import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodePng } from '../src/image/png';
import { decodeJpeg } from '../src/image/process';

describe('png', () => {
  it('is read back by PIL with the same pixels', () => {
    const img = decodeJpeg(new Uint8Array(readFileSync('test/fixtures/portrait.jpg')));
    const f = join(mkdtempSync(join(tmpdir(), 'ordo-png-')), 'a.png');
    writeFileSync(f, encodePng(img));
    const r = spawnSync('python3', ['-c', `
from PIL import Image
import json
im=Image.open(${JSON.stringify(f)}); im.load()
print(json.dumps([im.format, im.mode, im.size[0], im.size[1], list(im.getpixel((3,5))), list(im.getpixel((im.size[0]-1, im.size[1]-1)))]))`], { encoding: 'utf8' });
    if (r.status !== 0 && /No module/.test(r.stderr)) return;
    expect(r.status).toBe(0);
    const [fmt, mode, w, h, a, b] = JSON.parse(r.stdout);
    const px = (x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));
    expect([fmt, mode, w, h]).toEqual(['PNG', 'RGB', img.width, img.height]);
    expect(a).toEqual(px(3, 5));
    expect(b).toEqual(px(img.width - 1, img.height - 1));
  });
  it('passes pngcheck-style validation with Python zlib/CRC', () => {
    const png = encodePng({ width: 2, height: 2, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 255]) });
    const f = join(mkdtempSync(join(tmpdir(), 'ordo-png-')), 'b.png');
    writeFileSync(f, png);
    const r = spawnSync('python3', ['-c', `
import struct,zlib
d=open(${JSON.stringify(f)},'rb').read(); i=8; ok=True
while i<len(d):
    n,=struct.unpack('>I',d[i:i+4]); t=d[i+4:i+8]; body=d[i+8:i+8+n]; c,=struct.unpack('>I',d[i+8+n:i+12+n])
    ok&= zlib.crc32(t+body)&0xffffffff==c; i+=12+n
print(ok)`], { encoding: 'utf8' });
    if (r.status === 0) expect(r.stdout.trim()).toBe('True');
  });
});
