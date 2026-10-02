package com.fiveasidesnearme.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
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
    private static final String EXTRA = "field_invitation_payload";

    @Override
    public void load() {
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
        try {
            int id = call.getInt("id", 1);
            NotificationManager manager = (NotificationManager)
                getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            String channelId = "field_invitations";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                manager.createNotificationChannel(new NotificationChannel(
                    channelId, "Field invitations", NotificationManager.IMPORTANCE_HIGH
                ));
            }

            JSObject payload = call.getObject("notification", new JSObject());
            Intent intent = new Intent(getContext(), MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            intent.setData(Uri.parse("field-invitation://open/" + id));
            intent.putExtra(EXTRA, payload.toString());
            PendingIntent tap = PendingIntent.getActivity(
                getContext(), id, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            NotificationCompat.Builder builder = new NotificationCompat.Builder(
                getContext(), channelId
            ).setSmallIcon(android.R.drawable.ic_dialog_info)
             .setContentTitle(call.getString("title", "Field invitation"))
             .setContentText(call.getString("body", ""))
             .setStyle(new NotificationCompat.BigTextStyle()
                .bigText(call.getString("body", "")))
             .setContentIntent(tap)
             .setAutoCancel(true)
             .setOnlyAlertOnce(true)
             .setPriority(NotificationCompat.PRIORITY_HIGH);

            String badge = call.getString("badge", "");
            if (!badge.isEmpty()) {
                try {
                    byte[] bytes = Base64.decode(badge, Base64.DEFAULT);
                    Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (bitmap != null) builder.setLargeIcon(bitmap);
                } catch (Exception ignored) {}
            }
            manager.notify(id, builder.build());
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not display Field invitation", error);
        }
    }
}
