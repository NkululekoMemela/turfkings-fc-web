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

public final class FanmNotificationPresenter {
    private static final ExecutorService PICTURES = Executors.newFixedThreadPool(2);
    private static final LruCache<String, Bitmap> CACHE = new LruCache<>(24);
    private static final String EXTRA = "field_invitation_payload";
    private static Bitmap notificationPicture(String address, boolean circle) {
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

    public static void show(Context context, int id, String title, String body, JSObject payload) {
        try {
            NotificationManager manager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
            String channelId = "field_invitations";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                manager.createNotificationChannel(new NotificationChannel(
                    channelId, "FANM updates", NotificationManager.IMPORTANCE_HIGH
                ));
            }

            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            intent.setData(Uri.parse("field-invitation://open/" + id));
            intent.putExtra(EXTRA, payload.toString());
            PendingIntent tap = PendingIntent.getActivity(
                context, id, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            NotificationCompat.Builder builder = new NotificationCompat.Builder(
                context, channelId
            ).setSmallIcon(context.getApplicationInfo().icon)
             .setContentTitle(title)
             .setContentText(body)
             .setStyle(new NotificationCompat.BigTextStyle()
                .bigText(body))
             .setContentIntent(tap)
             .setAutoCancel(true)
             .setOnlyAlertOnce(true)
             .setPriority(NotificationCompat.PRIORITY_HIGH);

            final org.json.JSONObject data = payload.optJSONObject("data") == null ? new org.json.JSONObject() : payload.optJSONObject("data");
            builder.setLargeIcon(sourcePlaceholder(data.optString("sourceName", data.optString("clubName", "FANM"))));
            android.util.Log.i("FANM_PUSH", "native_requested allowed=" + manager.areNotificationsEnabled());
            manager.notify(id, builder.build());
            PICTURES.execute(() -> {
            try {
            String badge = data.optString("badge", "");
            if (!badge.isEmpty()) {
                try {
                    byte[] bytes = Base64.decode(badge, Base64.DEFAULT);
                    Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (bitmap != null) builder.setLargeIcon(framedBadge(bitmap));
                } catch (Exception ignored) {}
            }
            if (badge.isEmpty()) {
                Bitmap picture = notificationPicture(data.optString("senderPhotoUrl", ""), true);
                Bitmap group = notificationPicture(data.optString("groupLogoUrl", ""), false);
                // Give the sender the entire native icon slot. Other updates use their source logo.
                if (picture != null) builder.setLargeIcon(picture);
                else if (group != null) builder.setLargeIcon(group);
            }
            Bitmap content = notificationPicture(data.optString("contentImageUrl", ""), false, 720);
            if (content != null) builder.setStyle(new NotificationCompat.BigPictureStyle().bigPicture(content).setSummaryText(body));
            manager.notify(id, builder.build());
            } catch (Exception error) { android.util.Log.w("FANM", "Notification image unavailable", error); }
            });
        } catch (Exception error) {
            android.util.Log.w("FANM", "Notification could not be displayed", error);
        }
    }
}
