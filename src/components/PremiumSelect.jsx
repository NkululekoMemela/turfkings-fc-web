import React,{Children,forwardRef,isValidElement,useEffect,useId,useImperativeHandle,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './PremiumSelect.css';
const textOf=node=>Children.toArray(node).map(n=>typeof n==='string'||typeof n==='number'?String(n):isValidElement(n)?textOf(n.props.children):'').join('');
function optionsOf(children,disabled=false,group=''){
 return Children.toArray(children).flatMap(child=>{
  if(!isValidElement(child))return [];
  if(child.type==='option')return [{value:String(child.props.value??textOf(child.props.children)),label:child.props.label||textOf(child.props.children),disabled:disabled||child.props.disabled,hidden:child.props.hidden,selected:child.props.selected,group}];
  return optionsOf(child.props.children,disabled||child.props.disabled,child.type==='optgroup'?child.props.label:group);
 });
}
export default forwardRef(function PremiumSelect({children,value,defaultValue,onChange,onBlur,onFocus,className='',style,disabled=false,required=false,id,name,multiple=false,optionImages,...props},forwardedRef){
 const native=useRef(null),trigger=useRef(null),panel=useRef(null),search=useRef(null);
 const generated=useId(),listId=`premium-options-${generated}`;
 const options=optionsOf(children);
 const [local,setLocal]=useState(()=>defaultValue??options.find(o=>o.selected)?.value??options[0]?.value??'');
 const selected=String(value===undefined?local:value??'');
 const [open,setOpen]=useState(false),[filter,setFilter]=useState(''),[invalid,setInvalid]=useState(false);
 useImperativeHandle(forwardedRef,()=>native.current);
 const choose=option=>{
  if(disabled||option.disabled)return;
  const element=native.current;
  if(element)element.value=option.value;
  setLocal(option.value);setInvalid(false);setOpen(false);setFilter('');
  onChange?.({type:'change',target:element,currentTarget:element,preventDefault(){},stopPropagation(){}});
  requestAnimationFrame(()=>trigger.current?.focus());
 };
 useEffect(()=>{
  if(!open)return;
  const previous=document.activeElement,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';search.current?.focus();
  const key=e=>{
   if(e.key==='Escape'){e.preventDefault();setOpen(false);}
   if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
    const items=[...panel.current.querySelectorAll('[role="option"]:not(:disabled)')];if(!items.length)return;
    e.preventDefault();const index=items.indexOf(document.activeElement);
    const next=e.key==='Home'?0:e.key==='End'?items.length-1:e.key==='ArrowDown'?(index+1)%items.length:(index<=0?items.length:index)-1;
    items[next]?.focus();items[next]?.scrollIntoView({block:'nearest'});
   }
   if(e.key==='Tab'){
    const nodes=[...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
    const first=nodes[0],last=nodes.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',key);
  return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus?.();};
 },[open]);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 useEffect(()=>{const form=native.current?.form;if(!form)return;const reset=()=>{setLocal(defaultValue??options[0]?.value??'');setInvalid(false);};form.addEventListener('reset',reset);return()=>form.removeEventListener('reset',reset);},[defaultValue]);
 if(multiple)return <select {...props} ref={native} id={id} name={name} multiple value={value} defaultValue={defaultValue} onChange={onChange} className={className} style={style} disabled={disabled} required={required}>{children}</select>;
 const current=options.find(o=>o.value===selected),label=props['aria-label']||current?.label||'Choose an option';
 const matches=options.filter(o=>!o.hidden&&`${o.group} ${o.label}`.toLowerCase().includes(filter.trim().toLowerCase()));
 return <span className="fanm-premium-select" style={{width:style?.width||'100%',minWidth:0}}>
  <select {...props} ref={native} name={name} value={selected} onChange={onChange} required={required} disabled={disabled} tabIndex={-1} aria-hidden="true" className="fanm-premium-select__native" onClick={e=>e.preventDefault()} onInvalid={e=>{e.preventDefault();setInvalid(true);trigger.current?.focus();}}>{children}</select>
  <button {...props} id={id} ref={trigger} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-required={required||undefined} aria-invalid={invalid||props['aria-invalid']} disabled={disabled} className={`field-staff-picker__trigger fanm-premium-select__trigger ${className}`} style={style} onFocus={()=>onFocus?.({target:native.current,currentTarget:native.current})} onBlur={()=>onBlur?.({target:native.current,currentTarget:native.current})} onClick={e=>{e.preventDefault();setFilter('');setOpen(true);}} onKeyDown={e=>{props.onKeyDown?.(e);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();setOpen(true);}}}><span className={optionImages?'fanm-select-crest-label':undefined}>{optionImages?.[selected]&&<img src={optionImages[selected]} alt="" width="28" height="28" onError={e=>{e.currentTarget.hidden=true;}}/>}{current?.label||'Choose an option'}</span><span aria-hidden="true">⌄</span></button>
  {open&&createPortal(<div className="fanm-premium-select__backdrop" onClick={e=>{if(e.target===e.currentTarget)setOpen(false);}}><section ref={panel} role="dialog" aria-modal="true" aria-label={label} className="fanm-premium-select__panel"><header><strong>{props['aria-label']||'Choose an option'}</strong><button type="button" aria-label="Close options" onClick={()=>setOpen(false)}>×</button></header><input ref={search} type="search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search options" aria-label="Search options"/><div id={listId} role="listbox" aria-label={label} className="field-staff-picker__options">{matches.map((option,index)=><button type="button" key={`${option.value}:${index}`} role="option" aria-selected={option.value===selected} aria-pressed={option.value===selected} disabled={option.disabled} className="field-staff-picker__option" onClick={()=>choose(option)}><span className={optionImages?'fanm-select-crest-label':undefined}>{optionImages?.[option.value]&&<img src={optionImages[option.value]} alt="" width="28" height="28" loading="lazy" onError={e=>{e.currentTarget.hidden=true;}}/>}{option.group&&<small>{option.group} · </small>}{option.label}</span>{option.value===selected&&<span aria-hidden="true">✓</span>}</button>)}{!matches.length&&<p>No matching options.</p>}</div></section></div>,document.body)}
 </span>;
});
