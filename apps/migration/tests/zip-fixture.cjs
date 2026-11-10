const { crc32, deflateRawSync } = require("node:zlib");

// Small intentionally controllable ZIP producer for hostile-header fixtures.
module.exports = function zipFixture(entries) {
  const bodies = [],
    headers = [];
  let offset = 0;
  for (const item of entries) {
    const name = Buffer.from(item.name);
    const data = Buffer.from(item.data || "");
    const payload = item.deflate ? deflateRawSync(data) : data;
    const compressed =
      item.flags & 1 ? Buffer.concat([Buffer.alloc(12), payload]) : payload;
    const local = Buffer.alloc(30);
    const central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(item.flags || 0x800, 6);
    local.writeUInt16LE(item.deflate ? 8 : 0, 8);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(item.badCrc ? 1 : crc32(data), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(item.size ?? data.length, 22);
    local.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(0x314, 4);
    local.copy(central, 6, 4, 30);
    central.writeUInt32LE(((item.mode || 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    bodies.push(local, name, compressed);
    headers.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(headers);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...bodies, directory, end]);
};
