// v2: line-level fast path for quote-free lines + same field parser fallback
const COMMA=0, LINE_BREAK=1, END=2;
const BR=/[\r\n]/g;
export function run(input){
  const text=String(input.text); const header=input.header===true;
  const errors=[]; const rows=[]; let columns=null; let width=-1;
  const n=text.length; let pos=text.charCodeAt(0)===0xfeff?1:0; let line=1;
  let recordLine=1, recordRow=null;
  const DELIM=/[,\n\r]/g; function nextDelim(i){ DELIM.lastIndex=i; const m=DELIM.exec(text); return m===null?-1:m.index; }
  function readUnquoted(value){ let added=0, start=pos, parts=null;
    for(;;){ const d=nextDelim(pos);
      if(d===-1){ if(parts===null){ value+=text.slice(start); added+=n-start; } else { parts.push(text.slice(start)); added+=n-start; value=parts.join(''); } pos=n; return [value,END,added]; }
      const code=text.charCodeAt(d);
      if(code===44){ if(parts===null) value+=text.slice(start,d); else { parts.push(text.slice(start,d)); value=parts.join(''); } added+=d-start; pos=d+1; return [value,COMMA,added]; }
      if(code===10){ if(parts===null) value+=text.slice(start,d); else { parts.push(text.slice(start,d)); value=parts.join(''); } added+=d-start; pos=d+1; line+=1; return [value,LINE_BREAK,added]; }
      if(d+1<n&&text.charCodeAt(d+1)===10){ if(parts===null) value+=text.slice(start,d); else { parts.push(text.slice(start,d)); value=parts.join(''); } added+=d-start; pos=d+2; line+=1; return [value,LINE_BREAK,added]; }
      errors.push({code:'stray_cr',line:recordLine,row:recordRow});
      if(parts===null){ parts=[value,text.slice(start,d)]; value=''; } else parts.push(text.slice(start,d));
      added+=d-start; pos=d+1; start=pos; } }
  function readQuoted(){ const open=pos, openLine=line;
    const q=text.indexOf('"',pos+1);
    if(q===-1){ pos=open+1; line=openLine; errors.push({code:'unterminated_quote',line:recordLine,row:recordRow}); return readUnquoted('"'); }
    let hasEscape=text.charCodeAt(q+1)===34, hasBreak=false;
    BR.lastIndex=pos+1; const bm=BR.exec(text); if(bm!==null&&bm.index<q) hasBreak=true;
    if(!hasEscape&&!hasBreak){ const value=text.slice(pos+1,q); pos=q+1; return afterQuote(value); }
    let value='', seg=pos+1, p=pos+1, closed=false;
    while(p<n){ const c=text.charCodeAt(p);
      if(c===34){ if(p+1<n&&text.charCodeAt(p+1)===34){ value+=text.slice(seg,p)+'"'; p+=2; seg=p; continue; } value+=text.slice(seg,p); p+=1; closed=true; break; }
      if(c===13){ value+=text.slice(seg,p)+'\n'; line+=1; p+=(p+1<n&&text.charCodeAt(p+1)===10)?2:1; seg=p; continue; }
      if(c===10) line+=1; p+=1; }
    if(!closed){ pos=open+1; line=openLine; errors.push({code:'unterminated_quote',line:recordLine,row:recordRow}); return readUnquoted('"'); }
    pos=p; return afterQuote(value); }
  function afterQuote(value){ if(pos>=n) return [value,END]; const c=text.charCodeAt(pos);
    if(c===44){ pos+=1; return [value,COMMA]; } if(c===10){ pos+=1; line+=1; return [value,LINE_BREAK]; }
    if(c===13&&pos+1<n&&text.charCodeAt(pos+1)===10){ pos+=2; line+=1; return [value,LINE_BREAK]; }
    const junk=readUnquoted(value); if(junk[2]>0) errors.push({code:'quote_junk',line:recordLine,row:recordRow}); return junk; }
  function finishRecord(fields, quoted){
    if(fields.length===1&&fields[0]===''&&!quoted) return;
    if(width<0) width=fields.length;
    if(header&&columns===null){ columns=fields; return; }
    if(fields.length<width){ errors.push({code:'short_row',line:recordLine,row:recordRow,fields:fields.length}); while(fields.length<width) fields.push(''); }
    else if(fields.length>width){ errors.push({code:'long_row',line:recordLine,row:recordRow,extra:fields.splice(width)}); }
    rows.push(fields);
  }
  for(;;){
    while(pos<n){ const c=text.charCodeAt(pos);
      if(c===10){ pos+=1; line+=1; } else if(c===13&&pos+1<n&&text.charCodeAt(pos+1)===10){ pos+=2; line+=1; } else break; }
    if(pos>=n) break;
    recordLine=line; recordRow=header&&columns===null?null:rows.length;
    // line fast path: no quote before the next LF, and no CR except a trailing one
    const e=text.indexOf('\n',pos); const le=e===-1?n:e;
    const q=text.indexOf('"',pos);
    if(q===-1||q>=le){
      const r=text.indexOf('\r',pos);
      // A CR is a line break only as CRLF (a real LF follows it); a trailing
      // CR on the last line, with no LF after it, is a stray CR, not a break.
      if(r===-1||r>=le||(e!==-1&&r===le-1)){
        let seg=text.slice(pos,le);
        if(seg.charCodeAt(seg.length-1)===13) seg=seg.slice(0,-1);
        const fields=seg.split(',');
        pos=e===-1?n:e+1; line+=1;
        finishRecord(fields,false);
        continue;
      }
    }
    const fields=[]; let ended, quoted;
    do{ quoted=text.charCodeAt(pos)===34; const f=quoted?readQuoted():readUnquoted(''); fields.push(f[0]); ended=f[1]; }while(ended===COMMA);
    finishRecord(fields,quoted);
  }
  return {columns:header?(columns??[]):null, rows, errors};
}
