package com.fiveasidesnearme.app;

/** Stable conversation slots, separate across Clubs, Fields, teams, seasons and accounts. */
public final class FanmNotificationIdentity {
    public static boolean isChat(String type) {
        return "club_chat".equals(type) || "field_chat".equals(type)
            || "club_team_chat".equals(type) || "field_club_chat".equals(type);
    }
    public static int id(String key) {
        try {
            byte[] hash = java.security.MessageDigest.getInstance("SHA-256")
                .digest(key.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return 1 + (((hash[0]&127)<<24 | (hash[1]&255)<<16 | (hash[2]&255)<<8 | (hash[3]&255)) % 2000000000);
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
    public static String conversation(String type, String account, String club, String field, String team, String season) {
        if ("field_chat".equals(type)) { club=""; team=""; season=""; }
        if ("club_chat".equals(type)) { field=""; team=""; season=""; }
        StringBuilder key=new StringBuilder();
        for(String part:new String[]{type,account,club,field,team,season})key.append(part.length()).append(':').append(part);
        return key.toString();
    }
}
