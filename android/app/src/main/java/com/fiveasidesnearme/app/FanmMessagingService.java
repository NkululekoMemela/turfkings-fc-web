package com.fiveasidesnearme.app;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.getcapacitor.JSObject;
import com.google.firebase.messaging.RemoteMessage;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

public class FanmMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String,String> data = new HashMap<>(message.getData());
        if (!"2".equals(data.get("fanmRenderer"))) {
            super.onMessageReceived(message);
            return;
        }
        String key = data.getOrDefault("notificationKey",message.getMessageId() == null ? data.toString() : message.getMessageId());
        int id = Math.max(1,key.hashCode() & 0x7fffffff);
        JSObject payload = new JSObject();
        payload.put("id",String.valueOf(id));
        payload.put("title",data.getOrDefault("title","FANM update"));
        payload.put("body",data.getOrDefault("body",""));
        payload.put("data",new JSONObject(data));
        boolean foreground = FieldNotificationsPlugin.isAppVisible()
            && PushNotificationsPlugin.getPushNotificationsInstance() != null;
        android.util.Log.i("FANM_PUSH", "received type=" + data.getOrDefault("type", "update") + " appVisible=" + foreground);
        FanmNotificationPresenter.show(this,id,data.getOrDefault("title","FANM update"),data.getOrDefault("body",""),payload);
        data.put("nativePresented","true");
        RemoteMessage forwardedMessage = new RemoteMessage.Builder(message.getFrom() == null ? "fanm" : message.getFrom())
            .setMessageId(message.getMessageId() == null ? key : message.getMessageId())
            .setData(data).build();
        PushNotificationsPlugin.sendRemoteMessage(forwardedMessage);
    }
}
