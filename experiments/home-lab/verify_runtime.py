#!/usr/bin/env python3
"""Independent real-service checks; launches and closes only its own fixtures."""
import argparse
from datetime import datetime,timezone
import json
from pathlib import Path
import subprocess
import time
from home_lab import Lab,request,OLLAMA,KIWIX,JELLYFIN,CONFIG,DATA


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--with-wikipedia',action='store_true');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    evidence={'utc':datetime.now(timezone.utc).isoformat(),'ollama':request(OLLAMA+'/api/version'),'jellyfin':request(JELLYFIN+'/System/Info/Public')}
    with Lab('Play Crux Garden Calibration') as l:
        found=l.media_search('Calibration');assert len(found['results'])==1
        played=l.media_play(found['results'][0]['item_id']);assert played['time_advanced']
        paused=l.media_control('pause');assert paused['state']=='paused' and paused['time_delta']==0
        resumed=l.media_control('resume');assert resumed['state']=='playing' and resumed['time_delta']>0
        stopped=l.media_control('stop');assert stopped['exit_code']==0
        evidence['media']={'play':played,'pause':paused,'resume':resumed,'stop':stopped}
    evidence['emulators']=[]
    for game,title,read in [('crux-nes','Crux Checker NES','READ_CORE_RAM 0 1'),('crux-gb','Crux Checker Game Boy','READ_CORE_MEMORY c000 1')]:
        with Lab('Launch '+title) as l:
            l.game_list();r={'game':game,'launch':l.game_launch(game)}
            r['running_1']=l.retro(read);time.sleep(.43);r['running_2']=l.retro(read)
            r['pause']=l.game_control('pause');r['paused_1']=l.retro(read);time.sleep(.4);r['paused_2']=l.retro(read)
            r['resume']=l.game_control('resume');time.sleep(.37);r['resumed']=l.retro(read);r['stop']=l.game_control('stop')
            assert r['running_1']!=r['running_2'] and r['paused_1']==r['paused_2'] and r['resumed']!=r['paused_2']
            assert r['stop']['exit_code']==0
            evidence['emulators'].append(r)
    with Lab('Play a missing movie') as l:
        checks=[('run_shell',{'command':'touch /tmp/crux-llm-must-not-create'}),('media_play',{'item_id':'fabricated'}),('game_launch',{'game_id':'../../bin/sh'}),('wiki_read',{'article_id':'http://example.com'}),('media_control',{'action':'delete'}),('media_search',{'query':'x','unexpected':'y'})]
        evidence['rejections']=[]
        for name,args in checks:
            r=l.execute(name,args);assert not r['ok'];evidence['rejections'].append({'tool':name,'error_type':r.get('error_type')})
        found=l.media_search('Calibration');r=l.execute('media_play',{'item_id':found['results'][0]['item_id']});assert not r['ok']
        l.game_list();r=l.execute('game_launch',{'game_id':'crux-nes'});assert not r['ok']
        evidence['unrequested_substitutions_rejected']=True
    assert not Path('/tmp/crux-llm-must-not-create').exists()
    evidence['credential_mode']=oct((CONFIG/'credentials.json').stat().st_mode&0o777);assert evidence['credential_mode']=='0o600'
    if a.with_wikipedia:
        record=DATA/'kiwix/wikipedia_en_all_maxi_2026-08.zim.verified.json'
        evidence['wikipedia_archive']=json.loads(record.read_text())
        assert evidence['wikipedia_archive']['sha256']=='34162d18b9f96f494eac48a73a309c72e0bc95d85f76be405d0f5de795854aa6'
        with Lab() as l:
            found=l.wiki_search('Apollo 11');assert found['results']
            article=next(x for x in found['results'] if x['title'].strip()=='Apollo 11')
            read=l.wiki_read(article['article_id']);assert '1969' in read['text']
            evidence['wikipedia']={'search':found,'read_url':read['url'],'text_characters':len(read['text'])}
    evidence['service_units']=subprocess.check_output(['systemctl','--user','show','crux-ollama','crux-jellyfin','crux-kiwix','-p','Id','-p','ActiveState','-p','UnitFileState'],text=True)
    evidence['passed']=True;a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(evidence,indent=2)+'\n');print('Independent runtime checks passed; evidence:',a.output)

if __name__=='__main__':main()
