// UI shim for Phase 1 - populate placeholder metrics and user cards for visual parity with mobile
// Only populate placeholders when FirebaseServices isn't present so we don't overwrite real data
document.addEventListener('DOMContentLoaded', function(){
  if(window.FirebaseServices) return; // skip shim when real backend is available
  try {
    const lowRep = document.getElementById('metric-low-rep');
    const banned = document.getElementById('metric-banned-users');
    const total = document.getElementById('metric-total-users-phase1');
    if(lowRep) lowRep.textContent = '7';
    if(banned) banned.textContent = '3';
    if(total) total.textContent = '30';

    const list = document.getElementById('problem-users-list');
    if(list){
      // create 3 placeholder cards
      for(let i=1;i<=3;i++){
        const card = document.createElement('div');
        card.className = 'reputation-card';
        card.innerHTML = `
          <div class="rc-left">
            <div class="rc-username">@Utilisateur Test ${i}</div>
            <div class="rc-id">ID: user${i}@test.com</div>
            <div class="rc-stats">S:0 V:0</div>
          </div>
          <div class="rc-right">
            <div class="rc-score">${[45,25,85][i-1]}</div>
            <div class="rc-actions">
              <button class="btn-mini" title="Voir"><span class="material-icons">visibility</span></button>
              <button class="btn-mini" title="Bloquer"><span class="material-icons">block</span></button>
            </div>
          </div>
        `;
        list.appendChild(card);
      }
    }
  } catch(e){ console.warn('Phase1 UI shim error', e); }
});
