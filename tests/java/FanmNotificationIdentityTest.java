import com.fiveasidesnearme.app.FanmNotificationIdentity;
public class FanmNotificationIdentityTest {
    private static void check(boolean value) { if(!value)throw new AssertionError(); }
    private static int key(String type,String uid,String club,String field,String team,String season){return FanmNotificationIdentity.id(FanmNotificationIdentity.conversation(type,uid,club,field,team,season));}
    public static void main(String[] args){
        check(key("field_chat","u","clubA","field","","")==key("field_chat","u","clubB","field","",""));
        check(key("club_chat","u","club","","","")==key("club_chat","u","club","","", "newSeason"));
        check(key("club_chat","u","club","","","")!=key("club_chat","other","club","","",""));
        check(key("club_team_chat","u","club","","red","s")!=key("club_team_chat","u","club","","blue","s"));
        check(key("club_team_chat","u","club","","red","s")!=key("club_team_chat","u","club","","red","newSession"));
        check(key("field_club_chat","u","clubA","field","","s")!=key("field_club_chat","u","clubB","field","","s"));
        check(key("field_chat","u","","fieldA","","")!=key("field_chat","u","","fieldB","",""));
        for(int i=0;i<1000;i++){int id=FanmNotificationIdentity.id("conversation"+i);check(id>0&&id<2100000001);}
        check(FanmNotificationIdentity.isChat("field_chat"));check(!FanmNotificationIdentity.isChat("field_story"));
        System.out.println("PASS native conversation IDs: one Field thread across senders, separate teams, sessions, Clubs and accounts.");
    }
}
