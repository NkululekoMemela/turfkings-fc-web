import React from 'react';
import './NotificationFocus.css';
export default function NotificationTicketNotice({request,credit,loading,focused,onUse}){
 if(!request)return null;
 return <section id="fanm-notification-ticket" role="status" className={`fanm-ticket-notice ${credit&&focused?'fanm-notification-focus fanm-ticket-focus':''}`}>
  <h2>🎟️ {credit?'Your Match Ticket is ready':'Match cancellation update'}</h2>
  <p>{credit?'A Match Ticket is available in your wallet. Use it to book another match.':loading?'Checking your Match Ticket wallet…':'Your cancellation notice is open. Any eligible Match Ticket will appear here once issued.'}</p>
  {credit&&<><small>{credit.playerName||'Your ticket'} · Credit confirmed</small><button type="button" onClick={onUse}>Use this Match Ticket</button></>}
 </section>;
}
