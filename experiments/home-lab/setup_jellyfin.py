#!/usr/bin/env python3
"""Initialize this dedicated local discovery server; keep credentials out of Git."""
import json
import os
from pathlib import Path
import secrets
import urllib.parse
import urllib.request

ROOT=Path.home()/'.local/share/crux-garden-home'
PRIVATE=Path.home()/'.config/crux-garden-home/credentials.json'
AUTH='MediaBrowser Client="Crux Home Discovery", Device="Omarchy", DeviceId="crux-home-discovery", Version="0.1"'

def call(path,data=None,token=None):
    headers={'Content-Type':'application/json','Authorization':AUTH}
    if token: headers['Authorization']+=', Token="'+token+'"'
    req=urllib.request.Request('http://127.0.0.1:8096'+path,headers=headers,data=None if data is None else json.dumps(data).encode())
    with urllib.request.urlopen(req,timeout=60) as r:
        body=r.read();return json.loads(body) if body else None

def save(data):
    PRIVATE.parent.mkdir(parents=True,exist_ok=True)
    fd=os.open(PRIVATE,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    os.fchmod(fd,0o600)
    with os.fdopen(fd,'w') as f: json.dump(data,f,indent=2)

def main():
    info=call('/System/Info/Public')
    if PRIVATE.exists(): credentials=json.loads(PRIVATE.read_text())
    elif info['StartupWizardCompleted']:
        raise SystemExit('Existing configured server has no saved discovery credentials; refusing to change accounts.')
    else:
        credentials={'username':'crux-admin','password':secrets.token_urlsafe(24)};save(credentials)
    if not info['StartupWizardCompleted']:
        call('/Startup/Configuration',{'ServerName':'Crux Garden Home','UICulture':'en-US','MetadataCountryCode':'US','PreferredMetadataLanguage':'en'})
        call('/Startup/User',{'Name':credentials['username'],'Password':credentials['password']})
        call('/Startup/RemoteAccess',{'EnableRemoteAccess':False})
        call('/Startup/Complete',{})
    auth=call('/Users/AuthenticateByName',{'Username':credentials['username'],'Pw':credentials['password']})
    credentials.update(token=auth['AccessToken'],user_id=auth['User']['Id']);save(credentials)
    libraries=call('/Library/VirtualFolders',token=credentials['token'])
    if not any(x['Name']=='Crux Discovery Samples' for x in libraries):
        q=urllib.parse.urlencode({'name':'Crux Discovery Samples','collectionType':'homevideos','paths':str(ROOT/'media'),'refreshLibrary':'true'})
        opts={'Enabled':True,'EnableInternetProviders':False,'EnableRealtimeMonitor':True,'EnableEmbeddedTitles':True,'EnableChapterImageExtraction':False,'EnableTrickplayImageExtraction':False,'TypeOptions':[{'Type':t,'MetadataFetchers':[],'ImageFetchers':[],'SimilarItemProviders':[]} for t in ['Video','Movie','MusicVideo']]}
        call('/Library/VirtualFolders?'+q,{'LibraryOptions':opts},credentials['token'])
    print('Jellyfin configured; credentials stored privately with mode 0600. Library: Crux Discovery Samples.')

if __name__=='__main__': main()
