import React,{useEffect,useState} from "react";
import ShopShowcase from "../components/ShopShowcase.jsx";
import ShopOrderWorkspace from "./ShopOrderWorkspace.jsx";
import "./KitShopPage.css";
import "../components/ShopShowcase.css";

export default function KitShopPage({onBack,preferredColor="",isPracticeMode=false,club=null,canCreatePoll=false,onCreatePoll}) {
  const [ordersOpen,setOrdersOpen]=useState(false);
  const [scrolled,setScrolled]=useState(false);
  useEffect(()=>{const scroll=()=>setScrolled(window.scrollY>6);scroll();window.addEventListener("scroll",scroll,{passive:true});return()=>window.removeEventListener("scroll",scroll);},[]);
  return <main className="page kit-shop-page shop-preview-page">
    <div className={`landing-header-sticky ${scrolled?"is-scrolled":""}`}><header className="header"><div className="shop-page-header-row"><div className="header-title"><h1>FANM Shop</h1><div className="shop-header-context">Kit &amp; merchandise</div></div>{!ordersOpen&&<button type="button" className="secondary-btn shop-home-button" onClick={onBack} aria-label="Home" title="Home">🏠</button>}</div></header></div>
    <div className="shop-opening-corner" role="status"><strong>Opening soon</strong></div>
    {ordersOpen?<ShopOrderWorkspace onBack={()=>{setOrdersOpen(false);window.scrollTo(0,0);}} preferredColor={preferredColor} isPracticeMode={isPracticeMode}/>:<ShopShowcase canCreatePoll={canCreatePoll} onCreatePoll={onCreatePoll} club={club} preferredColor={preferredColor} onViewOrders={()=>{setOrdersOpen(true);window.scrollTo(0,0);}}/>}
  </main>;
}
