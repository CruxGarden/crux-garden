#!/usr/bin/env python3
"""Generate original, redistributable media and emulator fixtures (no commercial ROMs)."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess

ROOT = Path.home() / '.local/share/crux-garden-home'


def nes_rom():
    # Original NROM program: initialize PPU, render a checkerboard, count vblanks
    # in zero-page $00. NMI/IRQ return immediately. No external assets or BIOS.
    code = bytearray()
    labels = {}
    fixups = []
    def emit(*b): code.extend(b)
    def label(n): labels[n] = len(code)
    def branch(op, n): emit(op, 0); fixups.append((len(code)-1, n))
    emit(0x78, 0xD8, 0xA2, 0xFF, 0x9A, 0xE8)  # sei cld ldx txs inx
    emit(0x8E,0x00,0x20, 0x8E,0x01,0x20, 0x86,0x00)
    for n in ['warm1','warm2']:
        label(n); emit(0x2C,0x02,0x20); branch(0x10,n)
    emit(0xA9,0x3F,0x8D,0x06,0x20,0xA9,0,0x8D,0x06,0x20)
    for c in [0x0F,0x21,0x30,0x16]*8: emit(0xA9,c,0x8D,0x07,0x20)
    emit(0xA9,0x20,0x8D,0x06,0x20,0xA9,0,0x8D,0x06,0x20)
    emit(0xA2,4,0xA0,0,0xA9,0)
    label('fill');emit(0x8D,0x07,0x20,0xC8);branch(0xD0,'fill')
    emit(0xCA);branch(0xD0,'fill')
    emit(0x8D,0x05,0x20,0x8D,0x05,0x20,0xA9,0x0A,0x8D,0x01,0x20)
    label('frame');emit(0x2C,0x02,0x20);branch(0x10,'frame');emit(0xE6,0x00)
    emit(0x4C);code.extend(struct.pack('<H',0x8000+labels['frame']))
    label('interrupt');emit(0x40)
    for p,n in fixups:
        offset=labels[n]-p-1
        assert -128 <= offset < 128
        code[p]=offset&255
    prg=bytearray(16384);prg[:len(code)]=code
    prg[-6:]=struct.pack('<HHH',0x8000+labels['interrupt'],0x8000,0x8000+labels['interrupt'])
    chr_data=bytearray(8192);chr_data[:8]=bytes([0xAA,0x55]*4)
    return b'NES\x1a'+bytes([1,1])+bytes(10)+prg+chr_data


def gb_rom():
    # Original DMG ROM-only program; mGBA's internal boot initialization is used.
    rom=bytearray(32768);rom[0x100:0x104]=bytes([0,0xC3,0x50,0x01])
    # Four-byte cartridge-recognition signature required by GBIsROM in mGBA.
    rom[0x104:0x108]=bytes.fromhex('ce ed 66 66')
    rom[0x134:0x143]=b'CRUX CHECKER   '
    code=bytearray();labels={};fixups=[]
    def emit(*b):code.extend(b)
    def label(n):labels[n]=len(code)
    def branch(op,n):emit(op,0);fixups.append((len(code)-1,n))
    emit(0xF3,0x3E,0,0xE0,0x40,0x21,0,0x80,0x06,8)
    label('tile');emit(0x3E,0xAA,0x22,0x3E,0,0x22,0x05);branch(0x20,'tile')
    emit(0x21,0,0x98,0x01,0,4)
    label('map');emit(0xAF,0x22,0x0B,0x78,0xB1);branch(0x20,'map')
    emit(0x3E,0xE4,0xE0,0x47,0x3E,0x91,0xE0,0x40)
    label('vblank');emit(0xF0,0x44,0xFE,0x90);branch(0x20,'vblank')
    emit(0x21,0,0xC0,0x34)
    label('visible');emit(0xF0,0x44,0xFE,0x90);branch(0x28,'visible');branch(0x18,'vblank')
    for p,n in fixups:code[p]=(labels[n]-p-1)&255
    rom[0x150:0x150+len(code)]=code
    rom[0x14d]=(-sum(rom[0x134:0x14d])-25)&255
    checksum=sum(rom)&65535;rom[0x14e:0x150]=struct.pack('>H',checksum)
    return rom


def main():
    for n in ['media','games']: (ROOT/n).mkdir(parents=True,exist_ok=True)
    for title,source,freq in [('Crux Garden Calibration','testsrc2',440),('Crux Garden Color Bars','smptebars',660)]:
        p=ROOT/'media'/(title+'.mp4')
        if not p.exists():
            subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i',source+'=size=640x360:rate=30','-f','lavfi','-i',f'sine=frequency={freq}:sample_rate=48000','-t','30','-c:v','libx264','-preset','fast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-metadata','title='+title,str(p)],check=True)
    (ROOT/'games/crux-checker.nes').write_bytes(nes_rom())
    (ROOT/'games/crux-checker.gb').write_bytes(gb_rom())
    records=[{'file':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for d in ['media','games'] for p in sorted((ROOT/d).iterdir()) if p.is_file()]
    (ROOT/'fixtures.json').write_text(json.dumps(records,indent=2)+'\n')
    print(json.dumps(records,indent=2))

if __name__=='__main__': main()
