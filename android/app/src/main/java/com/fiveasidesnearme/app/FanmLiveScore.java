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
import android.view.View;
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
        String field=data.getOrDefault("projectId","")+":"+data.getOrDefault("recipientUid","")+":"+data.getOrDefault("venueId","")
            +":"+data.getOrDefault("seasonId","")+":"+data.getOrDefault("fixtureId","");
        String match="score:"+field;
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
        String home=data.getOrDefault("homeName","Home"),away=data.getOrDefault("awayName","Away");
        String score=data.getOrDefault("goalsA","0")+" – "+data.getOrDefault("goalsB","0");
        String scoreLine=home+" "+score+" "+away;
        String phase=FanmScorePolicy.phaseLabel(data.get("status"),data.get("phase"));
        String scorer=data.getOrDefault("goalScorer","").trim();
        String side=data.getOrDefault("goalSide","");
        boolean goal=!scorer.isEmpty()&&("home".equals(side)||"away".equals(side));
        String minute=data.getOrDefault("goalMinute","");
        String goalLine="Goal by "+scorer+(minute.matches("[0-9]{1,3}")?" at "+minute+"′":"");
        RemoteViews view=new RemoteViews(context.getPackageName(),goal?R.layout.fanm_goal_score:R.layout.fanm_live_score);
        if(goal){
            view.setTextViewText(R.id.fanm_goal_title,goalLine);
            view.setTextViewText(R.id.fanm_goal_detail,scoreLine+" · "+phase);
            view.setContentDescription(R.id.fanm_goal_crest,"home".equals(side)?home:away);
        }else{
            view.setTextViewText(R.id.fanm_score_home,home);view.setTextViewText(R.id.fanm_score_away,away);
            view.setTextViewText(R.id.fanm_score_number,score);view.setTextViewText(R.id.fanm_score_phase,phase);
        }
        view.setOnClickPendingIntent(R.id.fanm_score_close,close);
        NotificationCompat.Builder builder=new NotificationCompat.Builder(context,"fanm_live_scores").setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(goal?goalLine:scoreLine)
            .setContentText(goal?scoreLine+" · "+phase:phase)
            .setCustomContentView(view).setCustomBigContentView(view).setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setContentIntent(tap).setDeleteIntent(close).setAutoCancel(false).setOngoing(false).setOnlyAlertOnce(true).setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setCategory(NotificationCompat.CATEGORY_EVENT);
        try{manager.notify("FANM-SCORE:"+field,id,builder.build());}catch(SecurityException denied){return;}
        long deadline=SystemClock.elapsedRealtime()+2500;
        if(goal){
            Future<Bitmap> crest=loadLogo(data,"home".equals(side)?"homeLogo":"awayLogo");
            if(!showLogo(view,R.id.fanm_goal_crest,crest,deadline))return;
            view.setViewVisibility(R.id.fanm_goal_crest,View.VISIBLE);
        }else{
            Future<Bitmap> first=loadLogo(data,"homeLogo"),second=loadLogo(data,"awayLogo");
            showLogo(view,R.id.fanm_score_home_logo,first,deadline);
            showLogo(view,R.id.fanm_score_away_logo,second,deadline);
        }
        if(store.getBoolean("dismissed:"+match,false)||!version.equals(store.getString("version:"+field,"")))return;
        try{manager.notify("FANM-SCORE:"+field,id,builder.build());}catch(SecurityException ignored){}
    }
    private static Future<Bitmap> loadLogo(Map<String,String> data,String key){
        return LOGOS.submit(()->FanmNotificationPresenter.notificationPicture(data.getOrDefault(key,""),false));
    }
    private static boolean showLogo(RemoteViews view,int imageId,Future<Bitmap> image,long deadline){
        try{
            Bitmap bitmap=image.get(Math.max(1,deadline-SystemClock.elapsedRealtime()),TimeUnit.MILLISECONDS);
            if(bitmap!=null){view.setImageViewBitmap(imageId,bitmap);return true;}
        }catch(Exception ignored){}finally{image.cancel(true);}
        return false;
    }
    private FanmLiveScore(){}
}
