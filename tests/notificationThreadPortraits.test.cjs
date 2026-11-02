const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
test('expanded preview explicitly displays the same player bitmap, without Android initial avatars',()=>{
 const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'android/app/src/main/java/com/fiveasidesnearme/app/FanmNotificationPresenter.java'),'utf8');
 const start=source.indexOf('    private static CharSequence previewText('),end=source.indexOf('    public static synchronized void show(',start);assert(start>=0&&end>start);
 assert(!source.includes('new Person.Builder'));assert(!source.includes('MessagingStyle'));
 assert(source.includes('chatPreview(context,builder,thread,data.optString("sourceName",title),portrait)'));
 assert(source.includes('else if(portrait!=null)builder.setLargeIcon(portrait)'));
 assert(source.includes('if(teamChat){if(group!=null)builder.setLargeIcon(group);}'));
 assert(source.includes('if(current==null || !event.equals(current.extras.getString(EVENT)))return;'));
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fanm-portrait-test-'));
 const files={
 'android/text/Spanned.java':'package android.text;public interface Spanned {int SPAN_EXCLUSIVE_EXCLUSIVE=33;}',
 'android/text/SpannableStringBuilder.java':'package android.text;public class SpannableStringBuilder implements CharSequence {public static int bold=0;private final StringBuilder text=new StringBuilder();public SpannableStringBuilder append(String s){text.append(s);return this;}public int length(){return text.length();}public char charAt(int i){return text.charAt(i);}public CharSequence subSequence(int a,int b){return text.subSequence(a,b);}public void setSpan(Object s,int a,int b,int f){if(b>a)bold++;}public String toString(){return text.toString();}}',
 'android/text/style/StyleSpan.java':'package android.text.style;public class StyleSpan {public StyleSpan(int style){}}',
 'android/graphics/Typeface.java':'package android.graphics;public class Typeface {public static final int BOLD=1;}',

 'org/json/JSONObject.java':'package org.json; public class JSONObject {private final java.util.Map<String,String> values=new java.util.HashMap<>();public JSONObject put(String k,String v){values.put(k,v);return this;}public String optString(String k,String fallback){return values.getOrDefault(k,fallback);}}',
 'org/json/JSONArray.java':'package org.json; public class JSONArray {private final java.util.List<JSONObject> values=new java.util.ArrayList<>();public JSONArray put(JSONObject v){values.add(v);return this;}public int length(){return values.size();}public JSONObject optJSONObject(int i){return values.get(i);}}',
 'PortraitHarness.java':`import org.json.*;
public class PortraitHarness {
 static class Context {String getPackageName(){return "fanm";}}
 static class Bitmap {}
 static class View {static final int GONE=8,VISIBLE=0;}
 static class R {static class layout {static int fanm_chat_thread_preview=1;}static class id {static int fanm_thread_source=2,fanm_thread_messages=3,fanm_thread_portrait=4;}}
 static class RemoteViews {Bitmap image;int visibility;java.util.Map<Integer,CharSequence> text=new java.util.HashMap<>();RemoteViews(String p,int layout){}void setTextViewText(int id,CharSequence v){text.put(id,v);}void setViewVisibility(int id,int v){visibility=v;}void setImageViewBitmap(int id,Bitmap v){image=v;}}
 static class NotificationCompat {static class DecoratedCustomViewStyle {}static class Builder {RemoteViews view;Builder setStyle(DecoratedCustomViewStyle style){return this;}Builder setCustomBigContentView(RemoteViews v){view=v;return this;}}}
 ${source.slice(start,end)}
 public static void main(String[] args){
  JSONArray thread=new JSONArray();for(int i=0;i<10;i++)thread.put(new JSONObject().put("name",i%2==0?"Alex":"Bea").put("body","Exchange "+i));
  Bitmap picture=new Bitmap();NotificationCompat.Builder builder=new NotificationCompat.Builder();
  chatPreview(new Context(),builder,thread,"My team",picture);
  if(builder.view.image!=picture||builder.view.visibility!=View.VISIBLE)throw new AssertionError("Must reuse exact picture");
  String text=builder.view.text.get(R.id.fanm_thread_messages).toString();if(!text.contains("Bea: Exchange 9")||!text.contains("Alex: Exchange 8")||text.contains("Exchange 2"))throw new AssertionError(text);
  if(android.text.SpannableStringBuilder.bold!=7)throw new AssertionError("Every sender must be bold");
  chatPreview(new Context(),builder,thread,"My team",null);if(builder.view.visibility!=View.GONE||builder.view.image!=null)throw new AssertionError("No generated initial");
  System.out.println("PASS exact bitmap, recent exchanges, sender names and no initial fallback.");
 }
}`};
 try{
  for(const [name,text]of Object.entries(files)){const dest=path.join(temp,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);}
  const homeJava=process.env.JAVA_HOME&&path.join(process.env.JAVA_HOME,'bin/java');
  const java=homeJava&&fs.existsSync(homeJava)?homeJava:fs.existsSync('/usr/lib/jvm/java-17-openjdk-amd64/bin/java')?'/usr/lib/jvm/java-17-openjdk-amd64/bin/java':'java';
  execFileSync(java,['com.sun.tools.javac.Main','-d',temp,...Object.keys(files).map(name=>path.join(temp,name))],{stdio:'pipe'});
  assert(execFileSync(java,['-cp',temp,'PortraitHarness'],{encoding:'utf8'}).includes('PASS exact bitmap'));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
