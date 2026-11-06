import ClubPageRibbon from '../components/ClubPageRibbon.jsx';
import ClubBibOrders from "../components/ClubBibOrders.jsx";
import React,{useEffect,useState} from "react";
import ShopShowcase from "../components/ShopShowcase.jsx";
import ShopOrderWorkspace from "./ShopOrderWorkspace.jsx";
import "./KitShopPage.css";
import "../components/ShopShowcase.css";

export default function KitShopPage({onBack,preferredColor="",isPracticeMode=false,club=null,canCreatePoll=false,onCreatePoll,clubId=""}) {
  const [ordersOpen,setOrdersOpen]=useState(()=>typeof window!=="undefined"&&new URLSearchParams(window.location.search).has("shopOrder"));
  const [initialOrder,setInitialOrder]=useState(null);
  const [workspaceTab,setWorkspaceTab]=useState("orders");
  const [orderColour,setOrderColour]=useState(preferredColor);
  const [scrolled,setScrolled]=useState(false);
  useEffect(()=>{const scroll=()=>setScrolled(window.scrollY>6);scroll();window.addEventListener("scroll",scroll,{passive:true});return()=>window.removeEventListener("scroll",scroll);},[]);
  return <main className="page kit-shop-page shop-preview-page">
    <ClubPageRibbon title={<>FANM Shop</>} onHome={onBack} meta={<><div className="shop-header-context">Kit &amp; merchandise</div></>}/>
    <div className="shop-opening-corner" role="status"><strong>Club bulk orders</strong></div>
    {!ordersOpen&&<div id="club-bib-order-panel"><ClubBibOrders preferredColor={orderColour} clubId={clubId} isPracticeMode={isPracticeMode} onOpenSetup={()=>{setWorkspaceTab("setup");setOrdersOpen(true);window.scrollTo(0,0);}} onOrderPlaced={order=>{setInitialOrder(order);setWorkspaceTab("orders");setOrdersOpen(true);window.scrollTo(0,0);}}/></div>}
    {ordersOpen?<ShopOrderWorkspace initialOrder={initialOrder} initialTab={workspaceTab} onBack={()=>{setOrdersOpen(false);window.scrollTo(0,0);}} preferredColor={preferredColor} isPracticeMode={isPracticeMode}/>:<ShopShowcase canCreatePoll={canCreatePoll} onCreatePoll={onCreatePoll} club={club} preferredColor={preferredColor} onViewOrders={intent=>{if(intent?.kind==="bibs"){setOrderColour(intent.color||"");document.getElementById("club-bib-order-panel")?.scrollIntoView({behavior:"smooth",block:"start"});}else{setWorkspaceTab("orders");setOrdersOpen(true);window.scrollTo(0,0);}}}/>}
  </main>;
}
