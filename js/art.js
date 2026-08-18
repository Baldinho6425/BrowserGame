/* Corrida Turbo — refreshed Canvas art
 * Pure vector art: no external assets, scales cleanly at every resolution.
 * This module is intentionally self-contained so the game's renderer can migrate
 * from the original placeholder shapes to this visual language incrementally.
 */

export function turboRoundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function shade(hex, amount) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

export function drawTurboCar(c, x, y, w, h, body, glass, opts = {}) {
  c.save();
  c.translate(x, y);

  // Ground shadow
  c.fillStyle = 'rgba(0,0,0,.42)';
  c.beginPath(); c.ellipse(w/2, h+5, w*.48, 6, 0, 0, Math.PI*2); c.fill();

  // Nitro glow
  if (opts.nitro) {
    const g = c.createRadialGradient(w/2,h+10,1,w/2,h+25,34);
    g.addColorStop(0,'rgba(255,185,30,.75)');
    g.addColorStop(.35,'rgba(255,90,20,.35)');
    g.addColorStop(1,'rgba(255,50,10,0)');
    c.fillStyle=g; c.beginPath(); c.ellipse(w/2,h+16,w*.65,30,0,0,Math.PI*2); c.fill();
    c.fillStyle='#fff2a8';
    c.beginPath(); c.moveTo(w*.39,h-1); c.lineTo(w*.46,h+20); c.lineTo(w*.5,h-1); c.lineTo(w*.56,h+22); c.lineTo(w*.63,h-1); c.closePath(); c.fill();
  }

  // Wheels
  c.fillStyle='#080a0d';
  turboRoundRect(c,-3,h*.16,7,h*.22,3); c.fill();
  turboRoundRect(c,w-4,h*.16,7,h*.22,3); c.fill();
  turboRoundRect(c,-3,h*.62,7,h*.22,3); c.fill();
  turboRoundRect(c,w-4,h*.62,7,h*.22,3); c.fill();
  c.fillStyle='#555d68';
  for (const yy of [h*.22,h*.68]) { c.beginPath(); c.arc(1,yy,2,0,Math.PI*2); c.fill(); c.beginPath(); c.arc(w-1,yy,2,0,Math.PI*2); c.fill(); }

  // Main shell
  const bodyG=c.createLinearGradient(0,0,w,0);
  bodyG.addColorStop(0,shade(body,-35)); bodyG.addColorStop(.22,body); bodyG.addColorStop(.55,shade(body,15)); bodyG.addColorStop(1,shade(body,-40));
  c.fillStyle=bodyG; turboRoundRect(c,2,1,w-4,h-2,9); c.fill();
  c.strokeStyle='rgba(255,255,255,.22)'; c.lineWidth=1; c.stroke();

  // Hood and roof highlight
  c.fillStyle='rgba(255,255,255,.10)';
  turboRoundRect(c,w*.16,4,w*.68,h*.10,4); c.fill();
  c.fillStyle=glass;
  turboRoundRect(c,w*.16,h*.15,w*.68,h*.27,5); c.fill();
  c.strokeStyle='rgba(255,255,255,.25)'; c.stroke();
  c.fillStyle='rgba(8,16,26,.5)'; c.fillRect(w*.47,h*.16,1,h*.25);

  // Lower rear glass
  c.fillStyle=shade(glass,-20); turboRoundRect(c,w*.17,h*.57,w*.66,h*.18,4); c.fill();

  // Aggressive bumpers
  c.fillStyle=shade(body,-55); turboRoundRect(c,w*.08,h*.01,w*.84,5,2); c.fill();
  turboRoundRect(c,w*.08,h-6,w*.84,5,2); c.fill();

  // Lights
  c.fillStyle='#fff4bf'; turboRoundRect(c,w*.10,2,w*.19,5,2); c.fill(); turboRoundRect(c,w*.71,2,w*.19,5,2); c.fill();
  c.fillStyle='#ff314f'; turboRoundRect(c,w*.10,h-7,w*.19,5,2); c.fill(); turboRoundRect(c,w*.71,h-7,w*.19,5,2); c.fill();

  // Racing stripe
  if (opts.player) {
    c.fillStyle='rgba(255,255,255,.18)'; c.fillRect(w*.43,0,w*.14,h); c.fillStyle='rgba(0,0,0,.14)'; c.fillRect(w*.47,0,w*.04,h);
  }

  // Player aura / shield
  if (opts.shield) {
    c.strokeStyle='rgba(82,229,255,.8)'; c.lineWidth=2;
    c.shadowBlur=10; c.shadowColor='#52e5ff';
    c.beginPath(); c.ellipse(w/2,h/2,w*.64,h*.62,0,0,Math.PI*2); c.stroke(); c.shadowBlur=0;
  }
  c.restore();
}

export function drawTurboTruck(c,x,y,w,h,body) {
  c.save(); c.translate(x,y);
  c.fillStyle='rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(w/2,h+5,w*.5,7,0,0,Math.PI*2); c.fill();
  c.fillStyle='#11151a';
  for(const yy of [h*.28,h*.72]) { turboRoundRect(c,-4,yy,7,18,3); c.fill(); turboRoundRect(c,w-3,yy,7,18,3); c.fill(); }
  const box=c.createLinearGradient(0,0,w,0); box.addColorStop(0,'#7f8994'); box.addColorStop(.5,'#e5e9ee'); box.addColorStop(1,'#737c86');
  c.fillStyle=box; turboRoundRect(c,1,h*.27,w-2,h*.70,6); c.fill();
  c.strokeStyle='rgba(0,0,0,.25)'; c.lineWidth=1; c.stroke();
  c.fillStyle=body; turboRoundRect(c,2,0,w-4,h*.33,7); c.fill();
  c.fillStyle='#9edcff'; turboRoundRect(c,w*.14,h*.08,w*.72,h*.17,4); c.fill();
  c.fillStyle='rgba(255,255,255,.22)'; c.fillRect(w*.12,h*.39,w*.76,2);
  c.fillStyle='#fff1b0'; turboRoundRect(c,w*.08,1,w*.2,5,2); c.fill(); turboRoundRect(c,w*.72,1,w*.2,5,2); c.fill();
  c.fillStyle='#ff334f'; turboRoundRect(c,w*.08,h-6,w*.2,4,2); c.fill(); turboRoundRect(c,w*.72,h-6,w*.2,4,2); c.fill();
  c.restore();
}

export function drawTurboMoto(c,x,y,w,h,body) {
  c.save(); c.translate(x,y);
  c.fillStyle='rgba(0,0,0,.38)'; c.beginPath(); c.ellipse(w/2,h/2,w*.55,4,0,0,Math.PI*2); c.fill();
  c.strokeStyle='#080a0d'; c.lineWidth=4; c.beginPath(); c.arc(w/2,4,w*.38,0,Math.PI*2); c.stroke(); c.beginPath(); c.arc(w/2,h-4,w*.38,0,Math.PI*2); c.stroke();
  c.fillStyle=body; turboRoundRect(c,w*.16,h*.24,w*.68,h*.50,5); c.fill();
  c.fillStyle='#121820'; turboRoundRect(c,w*.22,h*.18,w*.56,h*.22,5); c.fill();
  c.fillStyle='#eaf8ff'; c.beginPath(); c.arc(w/2,h*.10,w*.16,0,Math.PI*2); c.fill();
  c.fillStyle='#ff4056'; c.beginPath(); c.arc(w/2,h*.9,w*.13,0,Math.PI*2); c.fill();
  c.restore();
}

export function drawTurboPolice(c,x,y,w,h,night=false) {
  drawTurboCar(c,x,y,w,h,'#1b2028','#b9d9ee',{night});
  c.save(); c.translate(x,y);
  c.fillStyle='rgba(255,255,255,.92)'; c.fillRect(1,h*.37,w-2,h*.14);
  const blue=Math.floor(performance.now()/120)%2===0;
  c.fillStyle=blue?'#4287ff':'#ff3558'; turboRoundRect(c,w*.18,-7,w*.28,7,2); c.fill();
  c.fillStyle=blue?'#ff3558':'#4287ff'; turboRoundRect(c,w*.54,-7,w*.28,7,2); c.fill();
  c.restore();
}

export function drawTurboCoin(c,x,y,s,spin=0) {
  c.save(); c.translate(x+s/2,y+s/2); c.scale(Math.max(.35,Math.abs(Math.cos(spin))),1); c.fillStyle='#ffd21a'; c.shadowBlur=8; c.shadowColor='#ffd21a'; c.beginPath(); c.arc(0,0,s*.45,0,Math.PI*2); c.fill(); c.shadowBlur=0; c.fillStyle='#8b6400'; c.font=`900 ${Math.max(8,s*.5)}px sans-serif`; c.textAlign='center'; c.textBaseline='middle'; c.fillText('$',0,1); c.restore();
}

export function drawTurboFuel(c,x,y,s,spin=0) {
  c.save(); c.translate(x+s/2,y+s/2); c.rotate(Math.sin(spin)*.12); c.fillStyle='#e23b4f'; turboRoundRect(c,-s*.42,-s*.45,s*.84,s*.9,s*.12); c.fill(); c.fillStyle='#ffda61'; c.fillRect(-s*.31,-s*.02,s*.62,s*.12); c.fillStyle='#252b33'; c.fillRect(-s*.12,-s*.52,s*.24,s*.12); c.strokeStyle='rgba(255,255,255,.28)'; c.stroke(); c.restore();
}

export function drawTurboHazard(c,type,x,y,w,h) {
  c.save(); c.translate(x+w/2,y+h/2);
  if(type==='cone') { c.fillStyle='rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0,h*.45,w*.5,4,0,0,Math.PI*2); c.fill(); c.fillStyle='#ff6b00'; c.beginPath(); c.moveTo(0,-h*.5); c.lineTo(w*.5,h*.45); c.lineTo(-w*.5,h*.45); c.closePath(); c.fill(); c.fillStyle='#fff'; c.fillRect(-w*.36,h*.05,w*.72,3); c.fillStyle='#20242a'; c.fillRect(-w*.5,h*.4,w,4); }
  else if(type==='oil') { c.fillStyle='rgba(8,10,14,.82)'; c.beginPath(); c.ellipse(0,0,w*.52,h*.35,0,0,Math.PI*2); c.fill(); c.strokeStyle='rgba(92,109,130,.35)'; c.lineWidth=2; c.stroke(); c.fillStyle='rgba(120,180,255,.16)'; c.beginPath(); c.ellipse(-w*.15,-h*.08,w*.17,h*.07,-.4,0,Math.PI*2); c.fill(); }
  else if(type==='banana') { c.strokeStyle='#ffd21a'; c.lineWidth=Math.max(4,w*.18); c.lineCap='round'; c.beginPath(); c.arc(0,0,w*.5,.2,Math.PI-.2); c.stroke(); c.strokeStyle='#fff1a0'; c.lineWidth=1; c.stroke(); }
  else { c.fillStyle='#090b0f'; c.beginPath(); c.ellipse(0,0,w*.5,h*.36,0,0,Math.PI*2); c.fill(); c.strokeStyle='rgba(255,255,255,.15)'; c.stroke(); }
  c.restore();
}
