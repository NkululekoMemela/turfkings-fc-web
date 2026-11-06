package com.fiveasidesnearme.app;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
public final class FanmLiveScore {
    private static final ExecutorService LOGOS=Executors.newFixedThreadPool(2);
    static SharedPreferences prefs(Context context){return context.getSharedPreferences("fanm_live_scores",Context.MODE_PRIVATE);}
    public static synchronized void show(Context context,Map<String,String> data){
        String field=data.getOrDefault("projectId","")+":"+data.getOrDefault("recipientUid","")+":"+data.getOrDefault("venueId","");
        String match="score:"+field+":"+data.getOrDefault("seasonId","")+":"+data.getOrDefault("fixtureId","");
        String version=data.getOrDefault("version","");SharedPreferences store=prefs(context);
        if(!FanmScorePolicy.show(version,store.getString("version:"+field,""),store.getBoolean("dismissed:"+match,false)))return;
        store.edit().putString("version:"+field,version).putString("active:"+field,match).apply();
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=new NotificationChannel("fanm_live_scores","Live match scores",NotificationManager.IMPORTANCE_LOW);channel.setSound(null,null);channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);manager.createNotificationChannel(channel);}
        int id=FanmScorePolicy.id(field);
        Intent dismiss=new Intent(context,FanmScoreDismissReceiver.class).setData(Uri.parse("fanm-score://dismiss/"+Uri.encode(match))).putExtra("field",field).putExtra("match",match);
        PendingIntent close=PendingIntent.getBroadcast(context,id,dismiss,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        JSONObject payload=new JSONObject();
        try{payload.put("id",String.valueOf(id));payload.put("data",new JSONObject(data));}catch(Exception ignored){}
        Intent launch=context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());if(launch==null)return;
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP).setData(Uri.parse("fanm-score://watch/"+Uri.encode(match))).putExtra("field_invitation_payload",payload.toString());
        PendingIntent tap=PendingIntent.getActivity(context,id,launch,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        RemoteViews view=new RemoteViews(context.getPackageName(),R.layout.fanm_live_score);
        view.setTextViewText(R.id.fanm_score_home,data.getOrDefault("homeName","Home"));view.setTextViewText(R.id.fanm_score_away,data.getOrDefault("awayName","Away"));
        String score=data.getOrDefault("goalsA","0")+" – "+data.getOrDefault("goalsB","0");view.setTextViewText(R.id.fanm_score_number,score);
        view.setTextViewText(R.id.fanm_score_phase,"completed".equals(data.get("status"))?"FULL TIME":"LIVE");
        view.setOnClickPendingIntent(R.id.fanm_score_close,close);
        NotificationCompat.Builder builder=new NotificationCompat.Builder(context,"fanm_live_scores").setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(data.getOrDefault("homeName","Home")+" "+score+" "+data.getOrDefault("awayName","Away"))
            .setCustomContentView(view).setCustomBigContentView(view).setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setContentIntent(tap).setDeleteIntent(close).setAutoCancel(false).setOngoing(false).setOnlyAlertOnce(true).setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setCategory(NotificationCompat.CATEGORY_EVENT);
        try{manager.notify("FANM-SCORE:"+field,id,builder.build());}catch(SecurityException denied){return;}
        Future<Bitmap> first=LOGOS.submit(()->FanmNotificationPresenter.notificationPicture(data.getOrDefault("homeLogo",""),false));
        Future<Bitmap> second=LOGOS.submit(()->FanmNotificationPresenter.notificationPicture(data.getOrDefault("awayLogo",""),false));
        long deadline=SystemClock.elapsedRealtime()+2500;
        try{
            Bitmap a=first.get(Math.max(1,deadline-SystemClock.elapsedRealtime()),TimeUnit.MILLISECONDS);
            if(a!=null)view.setImageViewBitmap(R.id.fanm_score_home_logo,a);
        }catch(Exception ignored){}
        try{
            Bitmap b=second.get(Math.max(1,deadline-SystemClock.elapsedRealtime()),TimeUnit.MILLISECONDS);
            if(b!=null)view.setImageViewBitmap(R.id.fanm_score_away_logo,b);
        }catch(Exception ignored){}
        first.cancel(true);second.cancel(true);
        if(store.getBoolean("dismissed:"+match,false)||!version.equals(store.getString("version:"+field,"")))return;
        try{manager.notify("FANM-SCORE:"+field,id,builder.build());}catch(SecurityException ignored){}
    }
    private FanmLiveScore(){}
}
