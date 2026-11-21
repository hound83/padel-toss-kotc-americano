/* Compact A4 schedule. Print and PDF consume the same positioned text. */
window.ScheduleDocument = (function(){
  'use strict';
  const width = 595, height = 842, margin = 36, bottom = 796;
  const measure = document.createElement('canvas').getContext('2d');
  function lines(text, size, bold, available){
    measure.font = (bold ? 'bold ' : '') + size + 'px Arial';
    const result = [];
    let line = '';
    for (const word of String(text).split(/\s+/)){
      const next = line ? line+' '+word : word;
      if (measure.measureText(next).width <= available){ line = next; continue; }
      if (line) result.push(line);
      line = '';
      for (const letter of word){
        if (line && measure.measureText(line+letter).width > available){result.push(line);line='';}
        line += letter;
      }
    }
    if (line) result.push(line);
    return result;
  }

  function layout(title, rounds){
    const pages = [];
    let page, y;
    function nextPage(){
      page = []; pages.push(page);
      y = margin;
      page.push({x:margin,y:y+16,size:17,bold:true,text:title});
      y += 42;
    }
    nextPage();
    for (const round of rounds){
      const rows = round.rows.map(row => {
        const label = lines(row.label,10,true,117);
        const value = lines(row.value,11,false,width-2*margin-130);
        return {label,value,height:Math.max(label.length,value.length,1)*15+6};
      });
      const heading = () => {
        page.push({x:margin,y:y+13,size:13,bold:true,text:round.heading}); y+=26;
      };
      const total = 26+rows.reduce((n,r)=>n+r.height,0);
      if (y>margin+42 && (total<=bottom-margin-42 ? y+total>bottom : y+26+(rows[0]?.height||0)>bottom)) nextPage();
      heading();
      for (const row of rows){
        if (y+row.height>bottom && row.height<=bottom-margin-68){ nextPage();heading(); }
        const count = Math.max(row.label.length,row.value.length,1);
        for (let i=0;i<count;i++){
          if (y+15>bottom){nextPage();heading();}
          if (row.label[i]) page.push({x:margin,y:y+11,size:10,bold:true,text:row.label[i]});
          if (row.value[i]) page.push({x:margin+130,y:y+11,size:11,bold:false,text:row.value[i]});
          y+=15;
        }
        y+=6;
      }
      y+=10;
    }
    pages.forEach((p,i)=>p.push({x:margin,y:height-22,size:9,bold:false,text:(i+1)+' / '+pages.length}));
    return pages;
  }

  function printPages(root,pages){
    const svgNS = 'http://www.w3.org/2000/svg';
    root.replaceChildren(...pages.map(items=>{
      const svg=document.createElementNS(svgNS,'svg');
      svg.setAttribute('viewBox','0 0 '+width+' '+height);
      for(const item of items){
        const text=document.createElementNS(svgNS,'text');
        for(const [key,value] of Object.entries({x:item.x,y:item.y,'font-size':item.size,'font-weight':item.bold?'bold':'normal','font-family':'Arial, sans-serif',fill:'#213950'})) text.setAttribute(key,value);
        text.textContent=item.text; svg.appendChild(text);
      }
      return svg;
    }));
  }

  function pdf(pages){
    const objects = [null,null,null];
    const object = body => {objects.push(body);return objects.length-1;};
    const normal = object('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const bold = object('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const special = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
    function hexText(text){
      let hex='';
      for(const ch of text){
        let n=ch.codePointAt(0);
        if(n>255){n=special.indexOf(ch);if(n<0)return null;n+=128;}
        hex+=n.toString(16).padStart(2,'0');
      }
      return hex;
    }
    // Standard PDF fonts cover Western names. Draw other scripts with the
    // browser's fallback fonts and preserve the original Unicode for copying.
    function imageText(item){
      const scale=3, canvas=document.createElement('canvas');
      const font=(item.bold?'bold ':'')+item.size+'px Arial';
      measure.font=font;
      canvas.width=Math.ceil((measure.measureText(item.text).width+4)*scale);
      canvas.height=Math.ceil(item.size*1.7*scale);
      const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
      ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#213950';ctx.font=font;ctx.fillText(item.text,1,item.size*1.2);
      const data=atob(canvas.toDataURL('image/jpeg',.96).split(',')[1]);
      return {id:object('<< /Type /XObject /Subtype /Image /ColorSpace /DeviceRGB /BitsPerComponent 8 /Width '+canvas.width+' /Height '+canvas.height+' /Filter /DCTDecode /Length '+data.length+' >>\nstream\n'+data+'\nendstream'),
        w:canvas.width/scale,h:canvas.height/scale};
    }
    const ids=pages.map(items=>{
      const images=[];
      let stream='0.13 0.22 0.32 rg\n';
      for(const item of items){
        const hex=hexText(item.text);
        if(hex!==null){
          stream+='BT /'+(item.bold?'B':'R')+' '+item.size+' Tf '+item.x+' '+(height-item.y)+' Td <'+hex+'> Tj ET\n';
        }else{
          const img=imageText(item);images.push(img.id);
          const unicode=item.text.split('').map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
          stream+='/Span << /ActualText <FEFF'+unicode+'> >> BDC q '+img.w+' 0 0 '+img.h+' '+(item.x-1)+' '+(height-item.y+item.size*1.2-img.h)+' cm /I'+img.id+' Do Q EMC\n';
        }
      }
      const content=object('<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
      return object('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+width+' '+height+'] /Resources << /Font << /R '+normal+' 0 R /B '+bold+' 0 R >> /XObject << '+images.map(id=>'/I'+id+' '+id+' 0 R').join(' ')+' >> >> /Contents '+content+' 0 R >>');
    });
    objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
    objects[2]='<< /Type /Pages /Count '+ids.length+' /Kids ['+ids.map(id=>id+' 0 R').join(' ')+'] >>';
    let body='%PDF-1.4\n',offsets=[0];
    objects.slice(1).forEach((value,i)=>{offsets.push(body.length);body+=(i+1)+' 0 obj\n'+value+'\nendobj\n';});
    const start=body.length;
    body+='xref\n0 '+objects.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n';
    return new Blob([Uint8Array.from(body,c=>c.charCodeAt(0))],{type:'application/pdf'});
  }
  return {layout,printPages,pdf};
})();
