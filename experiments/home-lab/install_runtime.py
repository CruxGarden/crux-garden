#!/usr/bin/env python3
"""Reproduce the user-local discovery installation on this Arch/Omarchy host.

Installs only below the current user's home; no sudo, package database, boot,
display, firewall or remote-access changes. Downloads about 142 GB including
Wikipedia and models. Run only when these installations are intended.
"""
import argparse
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import zipfile

HERE=Path(__file__).resolve().parent
REPO=HERE.parent.parent
HOME=Path.home()
DATA=HOME/'.local/share/crux-garden-home'
OPT=HOME/'.local/opt/crux-garden-home'
CONFIG=HOME/'.config/crux-garden-home'
STATE=HOME/'.local/state/crux-garden-home'
MANIFEST=json.loads((HERE/'artifacts.json').read_text())

def run(*args,**kwargs):return subprocess.run([str(a) for a in args],check=True,**kwargs)

def fetch(name,dest=None):
    p=dest or DATA/'downloads'/MANIFEST[name]['name']
    run(sys.executable,HERE/'fetch_artifact.py',HERE/'artifacts.json',name,p)
    return p

def extract(archive,dest,members=None):
    dest.mkdir(parents=True,exist_ok=True)
    names=subprocess.check_output(['bsdtar','-tf',str(archive)],text=True).splitlines()
    if any(Path(n).is_absolute() or '..' in Path(n).parts for n in names):raise ValueError('Unexpected archive path')
    run('bsdtar','-xf',archive,'-C',dest,*(members or []))

def write(path,text,mode=0o644):
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists() and path.read_text()!=text:
        backup=path.with_suffix(path.suffix+'.before-discovery-installer')
        if not backup.exists():shutil.copy2(path,backup)
    path.write_text(text);path.chmod(mode)

def configure():
    for n in ['downloads','kiwix','models','media','games','cores','saves','states','screenshots','system']:(DATA/n).mkdir(parents=True,exist_ok=True)
    for p in [OPT,CONFIG,STATE,HOME/'.cache/crux-garden-home/jellyfin',DATA/'jellyfin',STATE/'jellyfin']:p.mkdir(parents=True,exist_ok=True)
    for name in ['retroarch.cfg','jellyfin-network.xml']:
        target=CONFIG/'retroarch.cfg' if name=='retroarch.cfg' else CONFIG/'jellyfin/network.xml'
        # Jellyfin owns its network settings after first startup.
        if name=='jellyfin-network.xml' and target.exists():continue
        write(target,(HERE/'templates'/name).read_text().replace('@HOME@',str(HOME)))
    interactive=CONFIG/'retroarch-interactive.cfg'
    if not interactive.exists():
        content=(CONFIG/'retroarch.cfg').read_text().replace('audio_enable = "false"','audio_enable = "true"').replace('stdin_cmd_enable = "true"','stdin_cmd_enable = "false"').replace('config_save_on_exit = "false"','config_save_on_exit = "true"').replace('video_vsync = "false"','video_vsync = "true"')
        write(interactive,content)
    for p in (HERE/'templates/systemd').glob('*.service'):
        content=p.read_text().replace('@HOME@',str(HOME)).replace('%h/Workspace/CruxGarden/crux-garden',str(REPO))
        write(HOME/'.config/systemd/user'/p.name,content)
    bindir=HOME/'.local/bin';bindir.mkdir(parents=True,exist_ok=True)
    write(bindir/'crux-home','#!/bin/sh\nexec /usr/bin/python3 '+shlex.quote(str(HERE/'home_lab.py'))+' "$@"\n',0o755)
    write(bindir/'crux-ollama','#!/bin/sh\nexport OLLAMA_HOST=127.0.0.1:11434\nexec '+shlex.quote(str(OPT/'ollama-0.40.17/bin/ollama'))+' "$@"\n',0o755)
    write(bindir/'crux-retroarch','#!/bin/sh\nexport LD_LIBRARY_PATH='+shlex.quote(str(OPT/'retroarch-arch-1.22.2-6/usr/lib'))+'\nunset WAYLAND_DISPLAY\nexec '+shlex.quote(str(OPT/'retroarch-arch-1.22.2-6/usr/bin/retroarch'))+' -c '+shlex.quote(str(interactive))+' "$@"\n',0o755)
    apps=[('wikipedia','Crux Wikipedia','xdg-open http://127.0.0.1:8081','accessories-dictionary',False),('media','Crux Media','xdg-open http://127.0.0.1:8096','applications-multimedia',False),('retroarch','Crux RetroArch',str(bindir/'crux-retroarch')+' --menu','applications-games',False),('llm','Crux Local AI',str(bindir/'crux-ollama')+' run qwen3.5:9b','utilities-terminal',True)]
    for slug,name,command,icon,terminal in apps:
        write(HOME/'.local/share/applications'/('crux-home-'+slug+'.desktop'),f'[Desktop Entry]\nType=Application\nName={name}\nExec={command}\nIcon={icon}\nTerminal={str(terminal).lower()}\nCategories=Utility;\n')
    run('systemctl','--user','daemon-reload')

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--configure-only',action='store_true');p.add_argument('--with-wikipedia',action='store_true',help='Download and verify the entire 127 GB Wikipedia archive before returning.');p.add_argument('--pull-models',action='store_true');a=p.parse_args()
    for n in ['downloads','kiwix']:(DATA/n).mkdir(parents=True,exist_ok=True)
    if not a.configure_only:
        components=['ollama','kiwix','jellyfin','retroarch','retroarch_arch','openssl_portable','core_info']+['core_'+n for n in ['nestopia','mgba','snes9x','genesis_plus_gx']]
        archives={n:fetch(n) for n in components}
        # Download and verify first; never overwrite a running executable.
        units=['crux-ollama.service','crux-jellyfin.service','crux-kiwix.service']
        for unit in units:
            if (HOME/'.config/systemd/user'/unit).exists():run('systemctl','--user','stop',unit)
        extract(archives['ollama'],OPT/'ollama-0.40.17')
        extract(archives['kiwix'],OPT/'kiwix-3.8.2')
        extract(archives['jellyfin'],OPT/'jellyfin-12.4')
        # The original portable bundle supplies assets; its older binary is not used.
        extract(archives['retroarch'],OPT/'retroarch-1.22.2')
        extract(archives['retroarch_arch'],OPT/'retroarch-arch-1.22.2-6')
        extract(archives['openssl_portable'],OPT/'retroarch-arch-1.22.2-6',['usr/lib/libssl.so.4','usr/lib/libcrypto.so.4'])
        extract(archives['core_info'],DATA/'core-info')
        for n in ['nestopia','mgba','snes9x','genesis_plus_gx']:extract(archives['core_'+n],DATA/'cores')
    configure()
    run('systemctl','--user','enable','--now','crux-ollama.service','crux-jellyfin.service')
    run('systemctl','--user','enable','--now','crux-kiwix.service')
    run(sys.executable,HERE/'make_fixtures.py')
    # On a fresh machine Jellyfin may need a few seconds to initialize.
    import time,urllib.request
    consecutive=0
    for _ in range(60):
        try:
            urllib.request.urlopen('http://127.0.0.1:8096/System/Info/Public',timeout=2).close()
            consecutive+=1
            if consecutive>=3:break
        except OSError:consecutive=0
        time.sleep(1)
    else:raise RuntimeError('Jellyfin did not become consistently ready within 60 checks; inspect its journal.')
    run(sys.executable,HERE/'setup_jellyfin.py')
    if a.pull_models:
        for model in ['qwen3.5:9b','lfm2.5:8b']:run(HOME/'.local/bin/crux-ollama','pull',model)
    if a.with_wikipedia:
        fetch('wikipedia',DATA/'kiwix'/MANIFEST['wikipedia']['name'])
        run('systemctl','--user','start','crux-kiwix.service')
    print('User-local configuration ready. Run crux-home status. See the report for access, tests, and rollback.')

if __name__=='__main__':main()
