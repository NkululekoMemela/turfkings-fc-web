package com.fiveasidesnearme.app;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class FanmScoreDismissReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){
        String field=intent.getStringExtra("field"),match=intent.getStringExtra("match");if(field==null||match==null)return;
        FanmLiveScore.prefs(context).edit().putBoolean("dismissed:"+match,true).apply();
        if(match.equals(FanmLiveScore.prefs(context).getString("active:"+field,"")))
            ((NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE)).cancel("FANM-SCORE:"+field,FanmScorePolicy.id(field));
    }
}
