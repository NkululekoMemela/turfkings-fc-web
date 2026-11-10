import React, {useEffect, useRef} from "react";

export default function ExhibitionTeamsheetExport({onClose, onDownload}) {
  const dialog = useRef(null);
  useEffect(() => {dialog.current?.showModal();}, []);
  return <dialog ref={dialog} className="exhibition-export-dialog" aria-label="Download teamsheet"
    onCancel={(event) => {event.preventDefault(); onClose();}}>
    <header><strong>Download teamsheet</strong><button type="button" aria-label="Close download options" onClick={onClose}>×</button></header>
    <button type="button" className="primary-btn" autoFocus onClick={() => onDownload("image")}>Image</button>
    <button type="button" className="secondary-btn" onClick={() => onDownload("pdf")}>PDF</button>
  </dialog>;
}
