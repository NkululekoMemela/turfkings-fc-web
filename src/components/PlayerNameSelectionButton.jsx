import React from "react";
export default function PlayerNameSelectionButton({selected=false,children,...props}){
 return <button {...props} className={`field-staff-picker__trigger${selected?" is-selected":""}`} style={selected?{background:"linear-gradient(120deg,#064e3b,#065f46)",borderColor:"#34d399",color:"#ecfdf5",boxShadow:"0 0 0 2px rgba(52,211,153,.16)"}:undefined}>{children}</button>;
}
