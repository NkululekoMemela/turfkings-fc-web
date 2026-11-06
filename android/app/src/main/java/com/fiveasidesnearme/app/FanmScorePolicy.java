package com.fiveasidesnearme.app;
public final class FanmScorePolicy {
    public static int id(String field) { return 100000 + (field.hashCode() & 0x3fffffff); }
    public static boolean show(String version, String last, boolean dismissed) {
        return !dismissed && version != null && version.matches("[0-9]{21}") && version.compareTo(last == null ? "" : last) >= 0;
    }
    private FanmScorePolicy() {}
}
