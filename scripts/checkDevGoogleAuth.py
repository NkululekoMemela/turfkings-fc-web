from pathlib import Path
import json,os,re,subprocess

root=Path.cwd()
apk=root/'android/app/build/outputs/apk/dev/app-dev.apk'
if not apk.is_file():raise SystemExit('STOP: Build the Dev APK first.')
data=json.loads((root/'android/app/src/dev/google-services.json').read_text())
clients=[c for c in data['client'] if c.get('client_info',{}).get('android_client_info',{}).get('package_name')=='com.fiveasidesnearme.app.dev']
ids={o['client_id'] for c in clients for o in c.get('oauth_client',[]) if o.get('client_type')==3}
if len(ids)!=1:raise SystemExit('STOP: Dev OAuth web client is ambiguous.')
expected=next(iter(ids))
if data['project_info']['project_id']!='five-asides-near-me-staging':raise SystemExit('STOP: Dev JSON is not staging.')
sdk=os.environ.get('ANDROID_SDK_ROOT') or os.environ.get('ANDROID_HOME')
props=root/'android/local.properties'
if not sdk and props.exists():
    for line in props.read_text().splitlines():
        if line.startswith('sdk.dir='):sdk=line.split('=',1)[1].replace('\\:',':').replace('\\\\','\\')
if not sdk:raise SystemExit('STOP: Could not locate the Android SDK to verify the APK.')
tools=list((Path(sdk)/'build-tools').glob('*/aapt2'))
if not tools:raise SystemExit('STOP: No aapt2 found in Android SDK build-tools.')
tool=max(tools,key=lambda p:tuple(int(x) for x in re.findall(r'\d+',p.parent.name)))
badging=subprocess.check_output([str(tool),'dump','badging',str(apk)],text=True)
if not re.search(r"package: name='com\.fiveasidesnearme\.app\.dev'",badging):raise SystemExit('STOP: APK is not the Dev package. Do not install it.')
resources=subprocess.check_output([str(tool),'dump','resources',str(apk)],text=True)
def resource(name):
    m=re.search(r'(?m)^\s*resource\s+[^\n]*string/'+re.escape(name)+r'\b[^\n]*\n([\s\S]*?)(?=^\s*resource\s+|\Z)',resources)
    if not m:raise SystemExit('STOP: APK resource missing: '+name)
    return m.group(1)
client_values=re.findall(r'"([^"\n]*\.apps\.googleusercontent\.com)"',resource('default_web_client_id'))
if not client_values or set(client_values)!={expected}:raise SystemExit('STOP: Compiled Dev Google client does not match staging. Do not install this APK.')
if 'five-asides-near-me-staging' not in resource('project_id'):raise SystemExit('STOP: Compiled native Firebase project is not staging.')
print('PASS: Compiled APK package, Google web client and Firebase project all match Dev/staging.')
