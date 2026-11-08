package com.fiveasidesnearme.app;
public final class FanmScorePolicy {
    public static int id(String field) { return 100000 + (field.hashCode() & 0x3fffffff); }
    public static boolean show(String version, String last, boolean dismissed) {
        return !dismissed && version != null && version.matches("[0-9]{21}") && version.compareTo(last == null ? "" : last) >= 0;
    }
    private FanmScorePolicy() {}
    static String phaseLabel(String status, String phase) {
        if ("completed".equals(status) || "full_time".equals(phase)) return "Full time";
        if ("first_half".equals(phase)) return "First half";
        if ("halftime".equals(phase)) return "Half-time";
        if ("second_half".equals(phase)) return "Second half";
        if ("pre_match".equals(phase)) return "Lineups";
        return "Live";
    }
}
