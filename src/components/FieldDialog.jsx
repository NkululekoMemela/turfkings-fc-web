import './FieldDialog.css';
import {openDialog} from './PoolDialog.jsx';
export const fieldConfirm=message=>openDialog(message,'','confirm','field');
export const fieldAlert=message=>openDialog(message,'','alert','field');
export const fieldPrompt=(message,value)=>openDialog(message,value,'prompt','field');
