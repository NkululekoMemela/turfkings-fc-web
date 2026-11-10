package com.fiveasidesnearme.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.util.LruCache;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import android.os.Build;
import android.util.Base64;
import androidx.core.app.NotificationCompat;
import android.widget.RemoteViews;
import android.view.View;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import com.getcapacitor.JSObject;

public final class FanmNotificationPresenter {
    private static final ExecutorService PICTURES = Executors.newFixedThreadPool(2);
    private static final LruCache<String, Bitmap> CACHE = new LruCache<>(24);
    private static final String EXTRA = "field_invitation_payload";
    static Bitmap notificationPicture(String address, boolean circle) {
        return notificationPicture(address, circle, 192);
    }

    private static Bitmap notificationPicture(String address, boolean circle, int edge) {
        if (address == null || !address.startsWith("https://")) return null;
        String key = address + (circle ? ":circle" : ":logo") + edge;
        Bitmap cached = CACHE.get(key);
        if (cached != null) return cached;
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL(address).openConnection();
            connection.setConnectTimeout(3000);
            connection.setReadTimeout(3000);
            connection.setInstanceFollowRedirects(false);
            if (connection.getResponseCode() != 200) return null;
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (InputStream stream = connection.getInputStream()) {
                byte[] block = new byte[8192];
                int length;
                while ((length = stream.read(block)) != -1) {
                    if (output.size() + length > 2097152) return null;
                    output.write(block, 0, length);
                }
            }
            byte[] bytes = output.toByteArray();
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            options.inSampleSize = 1;
            while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > Math.max(512, edge)) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            Bitmap source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (source == null && edge <= 192) {
                String xml = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
                if (!xml.contains("<svg") || xml.contains("<!DOCTYPE") || xml.contains("<!ENTITY")) return null;
                com.caverock.androidsvg.SVG svg = com.caverock.androidsvg.SVG.getFromString(xml);
                svg.setDocumentWidth(192f);
                svg.setDocumentHeight(192f);
                svg.setDocumentPreserveAspectRatio(com.caverock.androidsvg.PreserveAspectRatio.LETTERBOX);
                source = Bitmap.createBitmap(192, 192, Bitmap.Config.ARGB_8888);
                new Canvas(source).drawPicture(svg.renderToPicture(192, 192));
            }
            if (source == null) return null;
            if (!hasArtwork(source)) { source.recycle(); return null; }
            if (edge > 192 && !circle) {
                float ratio = Math.min(1f, (float)edge / Math.max(source.getWidth(), source.getHeight()));
                Bitmap content = Bitmap.createScaledBitmap(source, Math.max(1, Math.round(source.getWidth()*ratio)), Math.max(1, Math.round(source.getHeight()*ratio)), true);
                if (content != source) source.recycle();
                CACHE.put(key, content);
                return content;
            }
            Bitmap result = Bitmap.createBitmap(edge, edge, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(result);
            if (circle) {
                Path path = new Path();
                path.addCircle(edge / 2f, edge / 2f, edge / 2f - 2, Path.Direction.CW);
                canvas.clipPath(path);
            } else {
                Path frame = new Path();
                frame.addRoundRect(new android.graphics.RectF(2, 2, edge-2, edge-2), 36, 36, Path.Direction.CW);
                canvas.clipPath(frame);
                canvas.drawColor(android.graphics.Color.WHITE);
            }
            float scale = (circle ? Math.max((float)edge / source.getWidth(), (float)edge / source.getHeight()) : Math.min((edge - 16f) / source.getWidth(), (edge - 16f) / source.getHeight()));
            android.graphics.RectF bounds = new android.graphics.RectF((edge - source.getWidth() * scale) / 2, (edge - source.getHeight() * scale) / 2, (edge + source.getWidth() * scale) / 2, (edge + source.getHeight() * scale) / 2);
            canvas.drawBitmap(source, null, bounds, new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
            source.recycle();
            CACHE.put(key, result);
            return result;
        } catch (Exception ignored) { return null; }
        finally { if (connection != null) connection.disconnect(); }
    }

    private static boolean hasArtwork(Bitmap bitmap) {
        // Keep the named source placeholder instead of replacing it with a blank image.
        for (int y=0; y<bitmap.getHeight(); y+=Math.max(1,bitmap.getHeight()/96)) {
            for (int x=0; x<bitmap.getWidth(); x+=Math.max(1,bitmap.getWidth()/96)) {
                int pixel=bitmap.getPixel(x,y);
                if (android.graphics.Color.alpha(pixel)>32 &&
                    (android.graphics.Color.red(pixel)<245 || android.graphics.Color.green(pixel)<245 || android.graphics.Color.blue(pixel)<245)) return true;
            }
        }
        return false;
    }

    private static Bitmap framedBadge(Bitmap bitmap) {
        Bitmap result = Bitmap.createBitmap(192, 192, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(result);
        Path frame = new Path();
        frame.addRoundRect(new android.graphics.RectF(2, 2, 190, 190), 36, 36, Path.Direction.CW);
        canvas.clipPath(frame);
        canvas.drawColor(android.graphics.Color.WHITE);
        float scale = Math.min(160f / bitmap.getWidth(), 160f / bitmap.getHeight());
        float width=bitmap.getWidth()*scale, height=bitmap.getHeight()*scale;
        canvas.drawBitmap(bitmap, null, new android.graphics.RectF((192-width)/2, (192-height)/2, (192+width)/2, (192+height)/2), new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        return result;
    }

    private static Bitmap flagBadge(String flag) {
        int[] points=flag.codePoints().toArray();
        if(points.length!=2 || points[0]<0x1F1E6 || points[0]>0x1F1FF || points[1]<0x1F1E6 || points[1]>0x1F1FF)return null;
        Bitmap bitmap=Bitmap.createBitmap(192,192,Bitmap.Config.ARGB_8888);
        Canvas canvas=new Canvas(bitmap);Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(android.graphics.Color.WHITE);
        canvas.drawRoundRect(new android.graphics.RectF(2,2,190,190),36,36,paint);
        paint.setTextSize(126);paint.setTextAlign(Paint.Align.CENTER);
        canvas.drawText(flag,96,96-(paint.ascent()+paint.descent())/2,paint);
        return bitmap;
    }

    private static Bitmap sourcePlaceholder(String name) {
        Bitmap result = Bitmap.createBitmap(192, 192, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(result);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(android.graphics.Color.WHITE);
        canvas.drawRoundRect(new android.graphics.RectF(2, 2, 190, 190), 36, 36, paint);
        StringBuilder initials = new StringBuilder();
        for (String word : name.trim().split("\\s+")) {
            if (!word.isEmpty() && initials.length()<2) initials.appendCodePoint(word.codePointAt(0));
        }
        paint.setColor(android.graphics.Color.rgb(15, 90, 56));
        paint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD));
        paint.setTextSize(64);
        paint.setTextAlign(Paint.Align.CENTER);
        canvas.drawText(initials.toString().toUpperCase(java.util.Locale.ROOT), 96, 96-(paint.ascent()+paint.descent())/2, paint);
        return result;
    }

    private static Bitmap challengeCrestPair(Bitmap home, Bitmap away, boolean compact) {
        final int width=compact?192:480, height=compact?192:218;
        final int size=compact?82:152, top=(height-size)/2;
        final int left=compact?2:52, right=width-left-size;
        Bitmap image=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);
        Canvas canvas=new Canvas(image);
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        if(!compact){paint.setColor(0xff13263a);canvas.drawRoundRect(new android.graphics.RectF(0,0,width,height),24,24,paint);}
        canvas.drawBitmap(home,null,new android.graphics.RectF(left,top,left+size,top+size),paint);
        canvas.drawBitmap(away,null,new android.graphics.RectF(right,top,right+size,top+size),paint);
        if(!compact){
            paint.setColor(0xffe7f5ff);paint.setTextSize(28);paint.setTextAlign(Paint.Align.CENTER);
            canvas.drawText("VS",width/2f,height/2f-(paint.ascent()+paint.descent())/2f,paint);
        }
        return image;
    }

    private static final String GROUP = "fanm.updates";
    private static final int SUMMARY_ID = 2100000001;
    private static final String THREAD = "fanm.thread";
    private static final String EVENT = "fanm.event";

    private static android.app.Notification active(NotificationManager manager, int id) {
        for (StatusBarNotification item : manager.getActiveNotifications())
            if (item.getId() == id && item.getTag() == null) return item.getNotification();
        return null;
    }

    private static void summary(Context context, NotificationManager manager, PendingIntent tap, String channelId) {
        NotificationCompat.InboxStyle lines = new NotificationCompat.InboxStyle();
        int count = 0;
        for (StatusBarNotification item : manager.getActiveNotifications()) {
            if (item.getId() == SUMMARY_ID || !GROUP.equals(item.getNotification().getGroup())) continue;
            count++;
            if (count <= 6) lines.addLine(item.getNotification().extras.getCharSequence("android.title", "FANM update"));
        }
        if (count < 2) { manager.cancel(SUMMARY_ID); return; }
        manager.notify(SUMMARY_ID, new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(context.getApplicationInfo().icon).setContentTitle("5 Asides Near Me")
            .setContentText(count + " conversations and updates").setStyle(lines)
            .setGroup(GROUP).setGroupSummary(true).setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setOnlyAlertOnce(true).setSilent(true).setContentIntent(tap).setAutoCancel(true).build());
    }

    private static CharSequence previewText(org.json.JSONArray thread) {
        android.text.SpannableStringBuilder text=new android.text.SpannableStringBuilder();
        // A native expanded notification has bounded height; keep the latest exchanges.
        for(int i=Math.max(0,thread.length()-7);i<thread.length();i++) {
            org.json.JSONObject line=thread.optJSONObject(i);if(line==null)continue;
            if(text.length()>0)text.append("\n\n");
            int start=text.length();
            text.append(line.optString("name","Player"));
            text.setSpan(new android.text.style.StyleSpan(android.graphics.Typeface.BOLD),start,text.length(),android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            text.append(": ").append(line.optString("body", ""));
        }
        return text;
    }

    private static void chatPreview(Context context, NotificationCompat.Builder builder,
            org.json.JSONArray thread, String source, Bitmap portrait) {
        RemoteViews view=new RemoteViews(context.getPackageName(),R.layout.fanm_chat_thread_preview);
        view.setTextViewText(R.id.fanm_thread_source,source);
        view.setTextViewText(R.id.fanm_thread_messages,previewText(thread));
        view.setViewVisibility(R.id.fanm_thread_portrait,portrait==null?View.GONE:View.VISIBLE);
        if(portrait!=null)view.setImageViewBitmap(R.id.fanm_thread_portrait,portrait);
        builder.setStyle(new NotificationCompat.DecoratedCustomViewStyle()).setCustomBigContentView(view);
    }

    public static synchronized void show(Context context, int suppliedId, String title, String body, JSObject payload) {
        try {
            NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
            String channelId="field_invitations";
            if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O)manager.createNotificationChannel(new NotificationChannel(channelId,"FANM updates",NotificationManager.IMPORTANCE_HIGH));
            final org.json.JSONObject data=payload.optJSONObject("data")==null?new org.json.JSONObject():payload.optJSONObject("data");
            final boolean chat=FanmNotificationIdentity.isChat(data.optString("type"));
            String conversation=FanmNotificationIdentity.conversation(data.optString("type"),data.optString("recipientUid"),data.optString("clubId"),data.optString("venueId"),data.optString("teamId"),data.optString("seasonId"));
            final int id=chat?FanmNotificationIdentity.id(conversation):suppliedId;
            final String event=data.optString("notificationKey",data.optString("messageId",String.valueOf(suppliedId)));
            org.json.JSONArray history=new org.json.JSONArray();
            android.app.Notification previous=active(manager,id);
            if(chat && previous!=null) {
                try { history=new org.json.JSONArray(previous.extras.getString(THREAD,"[]")); } catch(Exception ignored) {}
            }
            boolean seen=false;
            for(int i=0;i<history.length();i++)if(event.equals(history.optJSONObject(i).optString("event")))seen=true;
            if(chat && seen)return;
            if(chat) {
                org.json.JSONObject line=new org.json.JSONObject();line.put("event",event);line.put("name",data.optString("senderName","Player"));
                line.put("uid",data.optString("senderUid"));line.put("photoUrl",data.optString("senderPhotoUrl",""));line.put("body",body);line.put("time",data.optLong("sentAtMs",System.currentTimeMillis()));history.put(line);
            }
            final org.json.JSONArray thread=new org.json.JSONArray();
            for(int i=Math.max(0,history.length()-25);i<history.length();i++)thread.put(history.get(i));
            final Bitmap cachedPortrait=CACHE.get(data.optString("senderPhotoUrl","")+":circle192");
            final boolean teamChat="club_team_chat".equals(data.optString("type"));
            JSObject destination=new JSObject(payload.toString());destination.put("id",String.valueOf(id));
            Intent intent=new Intent(context,MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
            intent.setData(Uri.parse("field-invitation://open/"+id));intent.putExtra(EXTRA,destination.toString());
            PendingIntent tap=PendingIntent.getActivity(context,id,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            Bundle extras=new Bundle();extras.putString(THREAD,thread.toString());extras.putString(EVENT,event);
            NotificationCompat.Builder builder=new NotificationCompat.Builder(context,channelId)
                .setSmallIcon(context.getApplicationInfo().icon).setContentTitle(title).setContentText(body)
                .setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(false)
                .setGroup(GROUP).setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
                .setPriority(NotificationCompat.PRIORITY_HIGH).addExtras(extras);
            if(chat)chatPreview(context,builder,thread,data.optString("sourceName",title),cachedPortrait);
            else builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
            builder.setLargeIcon(sourcePlaceholder(data.optString("sourceName",data.optString("clubName","FANM"))));
            if(chat && cachedPortrait!=null && !teamChat)builder.setLargeIcon(cachedPortrait);
            manager.notify(id,builder.build());summary(context,manager,tap,channelId);
            PICTURES.execute(()->{
                try {
                    Bitmap portrait=notificationPicture(data.optString("senderPhotoUrl",""),true);
                    Bitmap group=(!chat||teamChat||portrait==null)?notificationPicture(data.optString("groupLogoUrl",""),false):null;
                    if(teamChat && group==null)group=flagBadge(data.optString("groupFlag",""));
                    Bitmap content=chat?null:notificationPicture(data.optString("contentImageUrl",""),false,720);
                    if(teamChat){if(group!=null)builder.setLargeIcon(group);}
                    else if(portrait!=null)builder.setLargeIcon(portrait);else if(group!=null)builder.setLargeIcon(group);
                    String badge=data.optString("badge","");
                    if(portrait==null && group==null && !badge.isEmpty())try {
                        byte[] bytes=Base64.decode(badge,Base64.DEFAULT);Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length);
                        if(bitmap!=null)builder.setLargeIcon(framedBadge(bitmap));
                    }catch(Exception ignored){}
                    if(chat)chatPreview(context,builder,thread,data.optString("sourceName",title),portrait);
                    else if(content!=null)builder.setStyle(new NotificationCompat.BigPictureStyle().bigPicture(content).setSummaryText(body));
                    if("club_exhibition_invitation".equals(data.optString("type"))){
                        Bitmap home=notificationPicture(data.optString("homeCrestUrl",""),false);
                        Bitmap away=notificationPicture(data.optString("awayCrestUrl",""),false);
                        if(home==null)home=sourcePlaceholder(data.optString("homeClubName","Home"));
                        if(away==null)away=sourcePlaceholder(data.optString("awayClubName","Away"));
                        builder.setLargeIcon(challengeCrestPair(home,away,true));
                        builder.setStyle(new NotificationCompat.BigPictureStyle().bigPicture(challengeCrestPair(home,away,false)).setSummaryText(body));
                    }
                    synchronized(FanmNotificationPresenter.class){
                        android.app.Notification current=active(manager,id);
                        // Never resurrect a dismissed message or let a slow old image replace newer exchanges.
                        if(current==null || !event.equals(current.extras.getString(EVENT)))return;
                        builder.setOnlyAlertOnce(true);manager.notify(id,builder.build());summary(context,manager,tap,channelId);
                    }
                }catch(Exception error){android.util.Log.w("FANM","Notification image unavailable",error);}
            });
        }catch(Exception error){android.util.Log.w("FANM","Notification could not be displayed",error);}
    }
}
