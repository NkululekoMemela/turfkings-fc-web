package com.fiveasidesnearme.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

@CapacitorPlugin(name = "FixtureImages")
public class FixtureImagesPlugin extends Plugin {
    @PluginMethod
    public void savePng(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Direct image saving requires Android 10 or later.");
            return;
        }
        String encoded = call.getString("base64", "");
        String requestedName = call.getString("filename", "fixtures.png");
        if (encoded.isEmpty() || encoded.length() > 48000000) {
            call.reject("The fixture image is empty or too large.");
            return;
        }
        new Thread(() -> {
            ContentResolver resolver = getContext().getContentResolver();
            Uri destination = null;
            try {
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                byte[] signature = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};
                if (bytes.length < signature.length) {
                    throw new IllegalArgumentException("Invalid PNG image.");
                }
                for (int i = 0; i < signature.length; i++) {
                    if (bytes[i] != signature[i]) {
                        throw new IllegalArgumentException("Invalid PNG image.");
                    }
                }
                String name = requestedName.replaceAll("[^A-Za-z0-9._-]", "-");
                if (name.endsWith(".png")) name = name.substring(0, name.length() - 4);
                if (name.length() > 120) name = name.substring(0, 120);
                name += "-" + System.currentTimeMillis() + ".png";

                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                values.put(MediaStore.Images.Media.RELATIVE_PATH,
                    Environment.DIRECTORY_PICTURES + "/5 Asides Near Me");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                destination = resolver.insert(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (destination == null) {
                    throw new IllegalStateException("Could not create the image.");
                }
                try (OutputStream output = resolver.openOutputStream(destination, "w")) {
                    if (output == null) {
                        throw new IllegalStateException("Could not write the image.");
                    }
                    output.write(bytes);
                    output.flush();
                }
                ContentValues published = new ContentValues();
                published.put(MediaStore.Images.Media.IS_PENDING, 0);
                if (resolver.update(destination, published, null, null) != 1) {
                    throw new IllegalStateException("Could not publish the saved image.");
                }
                JSObject response = new JSObject();
                response.put("saved", true);
                response.put("location", "Pictures/5 Asides Near Me");
                call.resolve(response);
            } catch (Exception error) {
                if (destination != null) {
                    try {
                        resolver.delete(destination, null, null);
                    } catch (Exception ignored) {
                        // Preserve the original saving error.
                    }
                }
                call.reject("Could not save the fixture image.", error);
            }
        }).start();
    }
}
