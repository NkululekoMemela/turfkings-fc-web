package com.fiveasidesnearme.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(FieldNotificationsPlugin.class);
        registerPlugin(FixtureImagesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
