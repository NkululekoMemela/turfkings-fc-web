package com.fiveasidesnearme.app;

import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(name = "PoolImages")
public class PoolImagesPlugin extends Plugin {
    private final Map<String, Uri> prepared = new HashMap<>();

    private byte[] png(PluginCall call) throws Exception {
        String encoded = call.getString("base64", "");
        if (encoded.length() > 12000000) throw new Exception("Standings image is too large.");
        byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
        if (bytes.length < 8 || bytes[0] != (byte)137 || bytes[1] != 80 || bytes[2] != 78 || bytes[3] != 71)
            throw new Exception("Could not prepare a valid PNG image.");
        return bytes;
    }

    private String filename(PluginCall call) {
        String name = call.getString("filename", "FANM-pool-standings.png");
        name = name.replaceAll("[^A-Za-z0-9._-]", "-");
        if (name.length() > 90) name = name.substring(0, 90);
        return name.endsWith(".png") ? name : name + ".png";
    }

    private String digest(byte[] bytes) throws Exception {
        return Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(bytes), Base64.NO_WRAP);
    }

    private boolean readable(Uri uri, String expectedHash) {
        try (InputStream stream = getContext().getContentResolver().openInputStream(uri)) {
            if (stream == null) return false;
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int count;
            while ((count = stream.read(buffer)) != -1) hash.update(buffer, 0, count);
            return expectedHash.equals(Base64.encodeToString(hash.digest(), Base64.NO_WRAP));
        } catch (Exception error) { return false; }
    }

    // Saving and sharing use the same validated PNG, not a second image conversion.
    private synchronized Uri prepareImage(PluginCall call) throws Exception {
        byte[] bytes = png(call);
        String hash = digest(bytes);
        Uri cached = prepared.get(hash);
        if (cached != null && readable(cached, hash)) return cached;
        Uri uri = null;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, filename(call));
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/FANM");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                uri = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("Could not create the image. Check free phone storage.");
                try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri)) {
                    if (stream == null) throw new Exception("Could not open image storage.");
                    stream.write(bytes);
                    stream.flush();
                }
                if (!readable(uri, hash)) throw new Exception("The stored image could not be verified. Check phone storage.");
                ContentValues ready = new ContentValues();
                ready.put(MediaStore.Images.Media.IS_PENDING, 0);
                if (getContext().getContentResolver().update(uri, ready, null, null) != 1)
                    throw new Exception("Image could not be published to your gallery.");
            } else {
                File directory = new File(getContext().getCacheDir(), "pool-images");
                if (!directory.exists() && !directory.mkdirs()) throw new Exception("Could not prepare image storage.");
                File file = new File(directory, System.currentTimeMillis() + "-" + filename(call));
                try (FileOutputStream stream = new FileOutputStream(file)) { stream.write(bytes); }
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".poolimages", file);
                if (!readable(uri, hash)) throw new Exception("Could not read the prepared image.");
            }
            prepared.put(hash, uri);
            return uri;
        } catch (Exception error) {
            if (uri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try { getContext().getContentResolver().delete(uri, null, null); } catch (Exception ignored) {}
            }
            throw error;
        }
    }

    @PluginMethod
    public void savePng(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q)
                throw new Exception("Use Share image to save this image on this Android version.");
            Uri uri = prepareImage(call);
            JSObject result = new JSObject();
            result.put("saved", true);
            result.put("location", "Gallery / Pictures / FANM");
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception error) { call.reject("Image not saved. " + error.getMessage(), error); }
    }

    @PluginMethod
    public void shareImage(PluginCall call) {
        try {
            Uri uri = prepareImage(call);
            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType("image/png");
            share.putExtra(Intent.EXTRA_STREAM, uri);
            ClipData attachment = ClipData.newUri(getContext().getContentResolver(), "Pool standings", uri);
            share.setClipData(attachment);
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(share, "Share pool standings");
            chooser.setClipData(attachment);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(chooser);
                    JSObject result = new JSObject(); result.put("opened", true); call.resolve(result);
                } catch (Exception error) { call.reject("Could not open the image sharing menu.", error); }
            });
        } catch (Exception error) { call.reject("Could not prepare the image for sharing. " + error.getMessage(), error); }
    }
}
