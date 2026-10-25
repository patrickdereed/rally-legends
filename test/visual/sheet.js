async () => {
  await new Promise(r => setTimeout(r, 800));
  const { CAR_BY_ID } = await import('/res/data.js');
  const ui = RL_APP.ui, s = RL_APP.showroom; ui.hide(); RL_APP.menuActive = true;
  const cv = RL_APP.renderer.domElement, out = [];
  const ids = window.__ids || ['mosquito', 'sanremo', 'asti', 'pleiad', 'kaze', 'ferox'];
  for (const id of ids) {
    const car = CAR_BY_ID[id]; s.show(car, car.livery, car.livery.rim); s.auto = false; s.yaw = window.__yaw || 0.8; s.pitch = 0.14; s.dist = 6.4;
    await new Promise(r => setTimeout(r, 300));
    s.update(0, RL_APP.camera, false);
    RL_APP.renderer.render(s.scene, RL_APP.camera);
    out.push(cv.toDataURL('image/jpeg', 0.85));
  }
  const img = await Promise.all(out.map(u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; })));
  const cw = img[0].width * 0.5, ch = img[0].height * 0.62, c = document.createElement('canvas'); c.width = cw * 3; c.height = ch * Math.ceil(ids.length / 3);
  const x = c.getContext('2d');
  img.forEach((im, k) => x.drawImage(im, im.width * 0.25, im.height * 0.2, cw, ch, (k % 3) * cw, Math.floor(k / 3) * ch, cw, ch));
  return c.toDataURL('image/jpeg', 0.85);
}
