// Reusable illustrated court, constructed in metres rather than guessed pixels.
// FIP crystal side variant: 20 x 10 m, 4 m glass returns, central mesh.
// Service lines: 6.95 m from net; centre marking extends 0.20 m beyond them.
// Two 1 x 2 m access openings per side flank the central net post.
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, {recursive:true});
const navy='#193B57', lime='#D8ED79', turf='#ACD937', glass='#B9DFE8';
const p=(x,y,z=0)=>[165+x*23-y*5,95+x*3.3+y*10-z*17].map(v=>+v.toFixed(2));
const points=vertices=>vertices.map(v=>p(...v).join(',')).join(' ');
const polygon=(vertices,attrs)=>`<polygon points="${points(vertices)}" ${attrs}/>`;
const line=(a,b,attrs='')=>`<line x1="${p(...a)[0]}" y1="${p(...a)[1]}" x2="${p(...b)[0]}" y2="${p(...b)[1]}" ${attrs}/>`;
function wall(x1,y1,x2,y2,z0,z1,material){
  let s=polygon([[x1,y1,z0],[x2,y2,z0],[x2,y2,z1],[x1,y1,z1]],
    `fill="${material==='glass'?glass:'none'}" fill-opacity=".16" stroke="${navy}" stroke-width="1.5" stroke-linejoin="round"`);
  const length=Math.hypot(x2-x1,y2-y1);
  if(material==='mesh'){
    for(let t=.3;t<length;t+=.3){const r=t/length,x=x1+(x2-x1)*r,y=y1+(y2-y1)*r;s+=line([x,y,z0],[x,y,z1],`stroke="${navy}" stroke-width=".55" opacity=".65"`);}
    for(let z=z0+.3;z<z1;z+=.3)s+=line([x1,y1,z],[x2,y2,z],`stroke="${navy}" stroke-width=".55" opacity=".65"`);
  }else{
    for(let t=2;t<length;t+=2){const r=t/length,x=x1+(x2-x1)*r,y=y1+(y2-y1)*r;s+=line([x,y,z0],[x,y,z1],`stroke="${navy}" stroke-width="1.2" opacity=".75"`);}
  }
  return s;
}
let court=polygon([[0,0,-.15],[10,0,-.15],[10,20,-.15],[0,20,-.15]],`fill="${navy}" stroke="${navy}" stroke-width="5" stroke-linejoin="round"`);
court+=polygon([[0,0],[10,0],[10,20],[0,20]],`fill="${turf}" stroke="${navy}" stroke-width="1.5"`);
court+=wall(0,0,10,0,0,3,'glass')+wall(0,0,10,0,3,4,'mesh');
for(const x of [0,10]){
  court+=wall(x,0,x,4,0,3,'glass')+wall(x,16,x,20,0,3,'glass');
  court+=wall(x,0,x,2,3,4,'mesh')+wall(x,18,x,20,3,4,'mesh');
  court+=wall(x,4,x,9,0,3,'mesh')+wall(x,11,x,16,0,3,'mesh');
  // Mesh only ABOVE access; clear openings extend from floor to 2 m.
  court+=wall(x,9,x,11,2,3,'mesh');
  for(const y of [0,2,4,6,8,9,10,11,12,14,16,18,20]){
    const z=[0,2,18,20].includes(y)?4:3;
    court+=line([x,y,0],[x,y,z],`stroke="${navy}" stroke-width="1.65"`);
  }
}
const marking='stroke="white" stroke-width="1.8"';
court+=line([0,3.05,.01],[10,3.05,.01],marking);
court+=line([0,16.95,.01],[10,16.95,.01],marking);
court+=line([5,2.85,.01],[5,17.15,.01],marking);
for(const [x,y,color] of [[2.5,5,navy],[7.5,5,navy],[2.5,15,'white'],[7.5,15,'white']]){
  const [cx,cy]=p(x,y,.08);court+=`<circle cx="${cx}" cy="${cy}" r="7.8" fill="${color}" stroke="${color===navy?'white':navy}" stroke-width="1.7"/>`;
}
court+=wall(0,10,10,10,0,.9,'mesh');
court+=line([0,10,.9],[10,10,.9],'stroke="white" stroke-width="2.2"');
court+=wall(0,20,10,20,0,3,'glass')+wall(0,20,10,20,3,4,'mesh');
// Two small reflection marks on each transparent end. No painted perimeter.
for(const y of [0,20])for(const x of [1,7]){
  court+=line([x,y,1.2],[x+.7,y,2.1],'stroke="white" stroke-width="1.4" opacity=".8"');
}
const crown=`<path d="M0 0 12 10 23-8 34 10 46 0 40 28H6Z" fill="${lime}" stroke="${navy}" stroke-width="3" stroke-linejoin="round"/><path d="M7 35H39" stroke="${navy}" stroke-width="3" stroke-linecap="round"/>`;
const use=(transform='')=>`<use href="#court" transform="${transform}"/>`;
function save(name,viewBox,body,description){
  fs.writeFileSync(path.join(out,name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="title desc"><title id="title">${name}</title><desc id="desc">${description}</desc><defs><g id="court">${court}</g></defs>${body}</svg>\n`);
}
save('mode-toss','25 0 420 355',use()+`<g transform="translate(65 40)" fill="none" stroke="${navy}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M0 2H8C17 2 18 23 28 23H35M29 17L35 23 29 29M0 23H8C17 23 18 2 28 2H35M29-4L35 2 29 8"/></g>`,'Illustrated 20 by 10 metre padel court with service lines, glass corner returns, mesh and access openings beside the net.');
let steps=`<path d="M35 355H195V287H350V214H510V390H35Z" fill="#DBE6EC" stroke="#B1C9D5" stroke-width="1.5"/>`;
steps+=use('translate(5 178) scale(.43)')+use('translate(160 105) scale(.43)')+use('translate(315 32) scale(.43)');
steps+=`<g transform="translate(416 16) scale(.8)">${crown}</g><g fill="none" stroke="#94C72D" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M133 227Q146 178 191 173M180 164 192 173 183 184M286 155Q299 106 345 100M333 92 345 100 336 112"/></g>`;
save('mode-koc','10 0 520 405',steps,'Three identical padel courts climb towards a crown.');
save('mode-americano','25 0 420 405',use('translate(0 45)')+`<rect x="169" y="13" width="173" height="53" rx="8" fill="${navy}"/><text x="255.5" y="49" text-anchor="middle" fill="${lime}" font-family="ui-monospace,Consolas,monospace" font-weight="800" font-size="31">26–6</text>`,'Padel court with a 26 to 6 point score, 32 points in total. This is a score, not a clock.');
function splitGroupLabel(center, group, name, color){
  return `<rect x="${center-122}" y="18" width="244" height="105" rx="24" fill="${color}"/><text x="${center}" y="56" font-size="34">${group}</text><text x="${center}" y="107" font-size="54" font-weight="800">${name}</text>`;
}
const splitCourts=use('translate(-8 132) scale(.71)')+use('translate(275 132) scale(.71)');
function saveSplit(name, group, silver, gold, description){
  const labels=splitGroupLabel(145,group,silver,'#DDE5EE')+splitGroupLabel(428,group,gold,'#F9D878');
  save(name,'10 0 590 400',splitCourts+`<g font-family="system-ui,sans-serif" font-weight="700" text-anchor="middle" fill="${navy}">${labels}</g>`,description);
}
saveSplit('mode-split','Groep','Zilver','Goud','Twee aparte padelbanen voor de niveaugroepen Zilver en Goud.');
saveSplit('mode-split-en','Group','Silver','Gold','Two separate padel courts for the Silver and Gold level groups.');
console.log('Built four matching court illustrations with a 26–6 point score.');
