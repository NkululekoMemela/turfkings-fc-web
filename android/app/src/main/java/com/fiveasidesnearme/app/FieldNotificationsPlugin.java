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
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FieldNotifications")
public class FieldNotificationsPlugin extends Plugin {
    private static volatile boolean appVisible = false;
    public static boolean isAppVisible() { return appVisible; }
    @Override protected void handleOnResume() { appVisible = true; }
    @Override protected void handleOnPause() { appVisible = false; }

    private static final String EXTRA = "field_invitation_payload";

    @Override
    public void load() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            manager.createNotificationChannel(new NotificationChannel("field_invitations", "FANM updates", NotificationManager.IMPORTANCE_HIGH));
        }
        deliverTap(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        deliverTap(intent);
    }

    private void deliverTap(Intent intent) {
        String payload = intent.getStringExtra(EXTRA);
        if (payload == null) return;
        intent.removeExtra(EXTRA);
        try {
            notifyListeners("opened", new JSObject(payload), true);
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void show(PluginCall call) {
        FanmNotificationPresenter.show(getContext(),call.getInt("id",1),call.getString("title","FANM update"),call.getString("body",""),call.getObject("notification",new JSObject()));
        call.resolve();
    }
}
