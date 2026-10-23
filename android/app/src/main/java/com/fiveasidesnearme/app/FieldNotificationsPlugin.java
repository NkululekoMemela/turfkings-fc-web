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
    private static final ExecutorService PICTURES = Executors.newFixedThreadPool(2);
    private static final LruCache<String, Bitmap> CACHE = new LruCache<>(24);

    private Bitmap notificationPicture(String address, boolean circle) {
        if (address == null || !address.startsWith("https://")) return null;
        String key = address + (circle ? ":circle" : ":logo");
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
            while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 512) options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            Bitmap source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (source == null) return null;
            Bitmap result = Bitmap.createBitmap(192, 192, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(result);
            if (circle) {
                Path path = new Path();
                path.addCircle(96, 96, 94, Path.Direction.CW);
                canvas.clipPath(path);
            }
            float scale = (circle ? Math.max(192f / source.getWidth(), 192f / source.getHeight()) : Math.min(176f / source.getWidth(), 176f / source.getHeight()));
            android.graphics.RectF bounds = new android.graphics.RectF((192 - source.getWidth() * scale) / 2, (192 - source.getHeight() * scale) / 2, (192 + source.getWidth() * scale) / 2, (192 + source.getHeight() * scale) / 2);
            canvas.drawBitmap(source, null, bounds, new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
            source.recycle();
            CACHE.put(key, result);
            return result;
        } catch (Exception ignored) { return null; }
        finally { if (connection != null) connection.disconnect(); }
    }

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
        PICTURES.execute(() -> present(call));
    }

    private void present(PluginCall call) {
        try {
            int id = call.getInt("id", 1);
            NotificationManager manager = (NotificationManager)
                getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            String channelId = "field_invitations";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                manager.createNotificationChannel(new NotificationChannel(
                    channelId, "FANM updates", NotificationManager.IMPORTANCE_HIGH
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
             .setContentTitle(call.getString("title", "FANM update"))
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
            if (badge.isEmpty()) {
                Bitmap picture = notificationPicture(call.getString("imageUrl", ""), Boolean.TRUE.equals(call.getBoolean("portrait", false)));
                if (picture != null) builder.setLargeIcon(picture);
            }
            manager.notify(id, builder.build());
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not display FANM notification", error);
        }
    }
}
