const adsConfig = {
  "extra_invoke": "https://pl30488279.effectivecpmnetwork.com/2f395279accd1eaa46ea57ce7938da03/invoke.js",
  "extra_id": "container-2f395279accd1eaa46ea57ce7938da03",
  "direct_url": "https://www.effectivecpmnetwork.com/ix4tuqw6qx?key=837ed7f0798e391ad6600e2ef5bff85b",
  "footer_scripts": [
    "https://pl30488278.effectivecpmnetwork.com/ba/eb/a5/baeba596747228db0bf3d3c3ecdde02f.js",
    "https://pl30488281.effectivecpmnetwork.com/a2/78/50/a27850ed385afa3a7af138655180f0a5.js"
  ],
  "a728x90": {"key":"77888d250a216f431f6335be20a48ac4","width":728,"height":90},
  "a320x50": {"key":"c42f6742d5b6b07be81432285ba75116","width":320,"height":50},
  "a468x60": {"key":"6b093fd5a1026c4cbf3cf53095a66e88","width":468,"height":60},
  "a160x600": {"key":"89573032f7d9490b14e69eb885a13db4","width":160,"height":600},
  "a160x300": {"key":"084998749d060a5b582d6f49e986bb56","width":160,"height":300},
  "a300x250": {"key":"eadec3b1e8df16cb5974c127275d525c","width":300,"height":250}
};

let adsLoaded = false;

function loadExternalScript(src, asyncValue = true) {
  return new Promise(function(resolve, reject) {
    const s = document.createElement('script');
    s.src = src;
    if(asyncValue) s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

function loadAdIntoSlot(slotId, ad) {
  return new Promise(function(resolve, reject) {
    const slot = document.getElementById(slotId);
    if(!slot) { resolve(); return; }
    window.atOptions = {
      'key': ad.key,
      'format': 'iframe',
      'height': ad.height,
      'width': ad.width,
      'params': {}
    };
    const s = document.createElement('script');
    s.src = 'https://www.highperformanceformat.com/' + ad.key + '/invoke.js';
    s.onload = resolve;
    s.onerror = reject;
    slot.appendChild(s);
  });
}

async function startAds() {
  if(adsLoaded) return;
  adsLoaded = true;
  await loadExternalScript(adsConfig.extra_invoke, true);
  await loadAdIntoSlot('slot-728x90', adsConfig.a728x90);
  await loadAdIntoSlot('slot-320x50', adsConfig.a320x50);
  await loadAdIntoSlot('slot-468x60', adsConfig.a468x60);
  await loadAdIntoSlot('slot-160x600', adsConfig.a160x600);
  await loadAdIntoSlot('slot-160x300', adsConfig.a160x300);
  await loadAdIntoSlot('slot-300x250', adsConfig.a300x250);
  await loadExternalScript(adsConfig.footer_scripts[0], true);
  await loadExternalScript(adsConfig.footer_scripts[1], true);
}

document.getElementById('topNoticeButton').addEventListener('click', async function() {
  document.body.classList.remove('notice-open');
  document.getElementById('topNotice').style.display = 'none';
  document.getElementById('topNoticeOverlay').style.display = 'none';
  await startAds();
});