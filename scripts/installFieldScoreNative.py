from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
java = root / 'android/app/src/main/java/com/fiveasidesnearme/app'
files = {name: (java / name).read_text() for name in (
    'FanmMessagingService.java', 'FanmNotificationPresenter.java', 'FieldNotificationsPlugin.java')}
message = files['FanmMessagingService.java']
if 'FanmLiveScore.show(this,data)' not in message:
    pattern = r'(?m)^(\s*)Map<String,\s*String>\s+data\s*=\s*new HashMap<>\(message.getData\(\)\);'
    matches = list(re.finditer(pattern, message))
    assert len(matches) == 1, 'STOP: Android message handler differs. Native files were not changed.'
    item = matches[0]
    message = message[:item.end()] + '\n' + item.group(1) + 'if ("field_live_score".equals(data.get("type"))) { FanmLiveScore.show(this,data); return; }' + message[item.end():]
files['FanmMessagingService.java'] = message
presenter = files['FanmNotificationPresenter.java']
signature = r'private\s+static\s+Bitmap\s+notificationPicture\(String address,\s*boolean circle\)'
if re.search(signature, presenter):
    presenter, count = re.subn(signature, 'static Bitmap notificationPicture(String address, boolean circle)', presenter)
    assert count == 1, 'STOP: Android logo renderer differs. Native files were not changed.'
else:
    assert 'static Bitmap notificationPicture(String address, boolean circle)' in presenter, 'STOP: Android logo renderer is missing. Native files were not changed.'
files['FanmNotificationPresenter.java'] = presenter
plugin = files['FieldNotificationsPlugin.java']
if 'void capabilities(' not in plugin:
    anchor = 'public class FieldNotificationsPlugin extends Plugin {'
    assert plugin.count(anchor) == 1, 'STOP: Android notification plugin differs. Native files were not changed.'
    plugin = plugin.replace(anchor, anchor + '\n    @PluginMethod\n    public void capabilities(PluginCall call) { JSObject result=new JSObject(); result.put("liveScore",1); call.resolve(result); }', 1)
assert re.search(r'put\(\s*"liveScore"\s*,\s*1\s*\)', plugin), 'STOP: Android capability method differs. Native files were not changed.'
files['FieldNotificationsPlugin.java'] = plugin
manifest = root / 'android/app/src/main/AndroidManifest.xml'
xml = manifest.read_text()
if 'FanmScoreDismissReceiver' not in xml:
    assert xml.count('</application>') == 1, 'STOP: Android manifest differs. Native files were not changed.'
    xml = xml.replace('</application>', '<receiver android:name=".FanmScoreDismissReceiver" android:exported="false" />\n    </application>')
for name, content in files.items():
    (java / name).write_text(content)
manifest.write_text(xml)
print('Android live score handler ready.')
