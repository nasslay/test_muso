// Phase 2 Anti Multi-comptes Web Module
// Parité avec anti_multicompte_dashboard.dart (Flutter)

(function(){
  if(!window.FirebaseServices){ console.warn('[Phase2AntiMulti] FirebaseServices indisponible'); }

  const C = {
    suspicious: () => FirebaseServices.collections.suspiciousAccounts,
    devices: () => FirebaseServices.collections.deviceRegistrations,
    users: () => FirebaseServices.collections.users,
  };

  const state = {
    suspiciousRaw: [],
    suspiciousFiltered: [],
    suspiciousSearch: '',
    suspiciousLevelFilter: 0,
    suspiciousSortBy: 'detectedAt', // detectedAt | suspicionLevel
    suspiciousSortDesc: true,
    suspiciousPerPage: 10,
    suspiciousPage: 0,

    devicesRaw: [],
    devicesFiltered: [],
    deviceSearch: '',
    minAccounts: 2,
    deviceSortBy: 'accountsCount', // accountsCount | lastActivity
    deviceSortDesc: true,
    devicesPerPage: 8,
    devicesPage: 0,

    usernameCache: new Map(),
    loadingSuspicious: false,
    loadingDevices: false,
  };

  function formatDate(d){ if(!(d instanceof Date)) return '--'; return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`; }

  async function getUsername(uid){
    if(state.usernameCache.has(uid)) return state.usernameCache.get(uid);
    try {
      const snap = await FirebaseServices.firestore.collection(C.users()).doc(uid).get();
      const username = snap.exists ? (snap.data().username || snap.data().displayName || ('user_'+uid.substring(0,6))) : 'user_'+uid.substring(0,6);
      state.usernameCache.set(uid, username); return username;
    } catch(e){ const fb='user_'+uid.substring(0,6); state.usernameCache.set(uid,fb); return fb; }
  }

  // ========= LOADERS =========
  async function loadSuspicious(){
    state.loadingSuspicious = true; renderSuspiciousLoading();
    try {
      const collName = C.suspicious();
      console.log('[Phase2AntiMulti] Fetching collection', collName);
      const ref = FirebaseServices.firestore.collection(collName);
      const snap = await ref.get();
      console.log('[Phase2AntiMulti] suspicious docs:', snap.size);
      if(snap.empty){ console.warn('[Phase2AntiMulti] Aucun document dans', collName); }
      state.suspiciousRaw = snap.docs.map(d=>mapSuspicious(d));
      applySuspiciousFilters();
      renderSuspicious();
      updatePhase2Metrics();
    } catch(e){
      console.error('[Phase2AntiMulti] Erreur chargement suspicious_accounts', e);
      state.suspiciousRaw=[]; state.suspiciousFiltered=[]; renderSuspicious(); updatePhase2Metrics();
    } finally { 
      state.loadingSuspicious=false; 
      // Forcer un re-render après finalisation pour enlever loader si chemin d'erreur silencieux
      renderSuspicious();
    }
  }

  async function loadDevices(){
    state.loadingDevices = true; renderDevicesLoading();
    try {
      const snap = await FirebaseServices.firestore.collection(C.devices()).get();
      console.log('[Phase2AntiMulti] devices docs:', snap.size);
      state.devicesRaw = snap.docs.map(d=>mapDevice(d));
      applyDeviceFilters();
      renderDevices();
    } catch(e){
      console.error('[Phase2AntiMulti] Erreur chargement devices', e);
      state.devicesRaw=[]; state.devicesFiltered=[]; renderDevices();
    } finally { state.loadingDevices=false; }
  }

  function mapSuspicious(doc){
    const d = doc.data();
    return {
      id: doc.id,
      suspicionLevel: d.suspicionLevel ?? 1,
      reasons: Array.isArray(d.reasons)? d.reasons : [],
      relatedAccounts: Array.isArray(d.relatedAccounts)? d.relatedAccounts : [],
      deviceId: d.deviceId || '',
      detectedAt: d.detectedAt?.toDate? d.detectedAt.toDate(): new Date(0),
      status: d.status || 'pending',
      metadata: d.metadata || {},
    };
  }

  function mapDevice(doc){
    const d = doc.data();
    return {
      id: doc.id,
      deviceId: doc.id,
      platform: d.platform || '—',
      model: d.model || null,
      accounts: Array.isArray(d.accounts)? d.accounts: [],
      firstRegistration: d.firstRegistration?.toDate? d.firstRegistration.toDate(): new Date(0),
      lastActivity: d.lastActivity?.toDate? d.lastActivity.toDate(): new Date(0),
    };
  }

  // ========= FILTERS =========
  function applySuspiciousFilters(){
    const q = state.suspiciousSearch.trim().toLowerCase();
    state.suspiciousFiltered = state.suspiciousRaw.filter(acc=>{
      if(q){
        const inReasons = acc.reasons.some(r=>r.toLowerCase().includes(q));
        if(!(acc.id.toLowerCase().includes(q) || inReasons)) return false;
      }
      if(state.suspiciousLevelFilter>0 && acc.suspicionLevel!==state.suspiciousLevelFilter) return false;
      return true;
    });
    state.suspiciousFiltered.sort((a,b)=>{
      let cmp = 0;
      switch(state.suspiciousSortBy){
        case 'detectedAt': cmp = a.detectedAt - b.detectedAt; break;
        case 'suspicionLevel': cmp = a.suspicionLevel - b.suspicionLevel; break;
      }
      return state.suspiciousSortDesc ? -cmp : cmp;
    });
    if(state.suspiciousPage * state.suspiciousPerPage >= state.suspiciousFiltered.length){ state.suspiciousPage = 0; }
  }

  function applyDeviceFilters(){
    const q = state.deviceSearch.trim().toLowerCase();
    state.devicesFiltered = state.devicesRaw.filter(dev=>{
      if(dev.accounts.length < state.minAccounts) return false;
      if(q){
        if(!(dev.deviceId.toLowerCase().includes(q) || dev.platform.toLowerCase().includes(q) || (dev.model||'').toLowerCase().includes(q))) return false;
      }
      return true;
    });
    state.devicesFiltered.sort((a,b)=>{
      let cmp=0;
      switch(state.deviceSortBy){
        case 'accountsCount': cmp = devAccounts(a)-devAccounts(b); break;
        case 'lastActivity': cmp = a.lastActivity - b.lastActivity; break;
      }
      return state.deviceSortDesc ? -cmp : cmp;
    });
    if(state.devicesPage * state.devicesPerPage >= state.devicesFiltered.length){ state.devicesPage=0; }
  }

  function devAccounts(d){ return d.accounts.length; }

  // ========= METRICS =========
  function updatePhase2Metrics(){
    const suspiciousCount = state.suspiciousRaw.length;
    const highRestrictions = state.suspiciousRaw.filter(a=>a.suspicionLevel>=4).length;
    const elSusp = document.getElementById('metric-suspicious-accounts'); if(elSusp) elSusp.textContent = suspiciousCount;
    const elRestr = document.getElementById('metric-active-restrictions'); if(elRestr) elRestr.textContent = highRestrictions;
  }

  // ========= RENDER =========
  function renderSuspiciousLoading(){ const list = document.getElementById('suspicious-cards-list'); if(list) list.innerHTML='<div class="loading-inline">Chargement comptes suspects...</div>'; }
  function renderDevicesLoading(){ const list = document.getElementById('devices-body'); if(list) list.innerHTML='<tr><td colspan="6" style="text-align:center;">Chargement appareils...</td></tr>'; }

  async function buildSuspiciousCard(acc){
    const username = await getUsername(acc.id);
    const levelClass = `level-${acc.suspicionLevel}`;
    const avatarUrl = acc.metadata && acc.metadata.avatarUrl ? acc.metadata.avatarUrl : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=0D8ABC&color=fff&size=96';
    const related = acc.relatedAccounts.length ? `<div class='sc-related'><span class='material-icons'>group</span>${acc.relatedAccounts.length} liés</div>`:'';
    return `<div class="suspicious-card ${levelClass}" data-sid="${acc.id}">
      <div class="sc-header">
        <img class="sc-avatar" src="${avatarUrl}" alt="avatar" />
        <div class="sc-username">${username}</div>
        <div class="sc-level">Niv ${acc.suspicionLevel}</div>
      </div>
      <div class="sc-id">ID: ${acc.id.substring(0,8)}...</div>
      <div class="sc-reasons">${acc.reasons.slice(0,2).map(r=>`<span>⚠️ ${r}</span>`).join('')}${acc.reasons.length>2 ? '<span>…</span>':''}</div>
      ${related}
      <div class="sc-footer">Détecté: ${formatDate(acc.detectedAt)} ${acc.suspicionLevel>=4?'<span class="sc-action-required">Action requise</span>':''}</div>
    </div>`;
  }

  function suspicionColor(level){
    if(level<=2) return 'var(--accent-yellow)';
    if(level===3) return 'var(--accent-orange)';
    return 'var(--accent-red)';
  }

  async function renderSuspicious(){
    const list = document.getElementById('suspicious-cards-list');
    const empty = document.getElementById('suspicious-cards-empty');
    if(!list) return;
    if(state.loadingSuspicious){ return; }
    console.log('[Phase2AntiMulti] render suspicious filtered:', state.suspiciousFiltered.length);
    if(state.suspiciousFiltered.length===0){ list.innerHTML=''; if(empty) empty.style.display='block'; renderSuspiciousPagination(); return; }
    if(empty) empty.style.display='none';
    const start = state.suspiciousPage * state.suspiciousPerPage;
    const end = Math.min(start + state.suspiciousPerPage, state.suspiciousFiltered.length);
    const slice = state.suspiciousFiltered.slice(start,end);
    list.innerHTML = '<div class="loading-inline">Construction cartes...</div>';
    Promise.all(slice.map(a=>buildSuspiciousCard(a)))
      .then(arr=>{
        list.innerHTML = arr.join('');
        attachSuspiciousCardEvents();
        renderSuspiciousPagination();
      })
      .catch(e=>{
        console.error('[Phase2AntiMulti] build cards error', e);
        list.innerHTML = '<div style="padding:12px;color:#f66;">Erreur rendu cartes.</div>';
      });
  }

  function renderSuspiciousPagination(){
    const info = document.getElementById('suspicious-page-info');
    if(!info) return; // optional element
    const totalPages = Math.ceil(state.suspiciousFiltered.length / state.suspiciousPerPage) || 1;
    info.textContent = `Page ${state.suspiciousPage+1}/${totalPages}`;
  }

  function buildDeviceRow(dev){
    const danger = dev.accounts.length>3;
    return `<tr data-did="${dev.id}">
      <td class="device-id">${dev.deviceId.substring(0,12)}...</td>
      <td>${dev.platform}</td>
      <td>${dev.model||'—'}</td>
      <td><span class="account-count ${danger?'high':'medium'}">${dev.accounts.length}</span></td>
      <td>${formatDate(dev.lastActivity)}</td>
      <td><button class="btn-sm btn-primary" data-action="details">Détails</button></td>
    </tr>`;
  }

  function renderDevices(){
    const tbody = document.getElementById('devices-body');
    if(!tbody) return;
    if(state.loadingDevices) return;
    if(state.devicesFiltered.length===0){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;">Aucun appareil</td></tr>'; return; }
    const start = state.devicesPage * state.devicesPerPage;
    const end = Math.min(start + state.devicesPerPage, state.devicesFiltered.length);
    const slice = state.devicesFiltered.slice(start,end);
    tbody.innerHTML = slice.map(buildDeviceRow).join('');
    attachDeviceRowEvents();
  }

  // ========= EVENTS / MODALS =========
  function ensureModal(){ if(!document.getElementById('generic-modal')){ /* créé par phase1 si déjà chargé */ } }

  function openModal(title, body){
    // Always use a custom modal for phase 2
    let modal = document.getElementById('phase2-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'phase2-modal';
      modal.className = 'phase2-modal';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class='phase2-modal-content'><div class='phase2-modal-header'><div class='phase2-modal-title'>${title}</div><button class='phase2-modal-close'>&times;</button></div><div class='phase2-modal-body'>${body}</div></div>`;
    modal.style.display = 'flex';
    // Close logic
    modal.querySelector('.phase2-modal-close').onclick = function() { modal.style.display = 'none'; };
    // Optional: close on click outside
    modal.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };
  }

  function attachSuspiciousCardEvents(){
    const list = document.getElementById('suspicious-cards-list');
    if(!list) return;
    list.querySelectorAll('.suspicious-card').forEach(card=>{
      card.addEventListener('click', async ()=>{
        const id = card.dataset.sid;
        const acc = state.suspiciousRaw.find(a=>a.id===id);
        if(acc) openSuspiciousDetails(acc);
      });
    });
  }

  function attachDeviceRowEvents(){
    const tbody = document.getElementById('devices-body');
    if(!tbody) return;
    tbody.querySelectorAll('tr').forEach(row=>{
      row.querySelectorAll('button[data-action="details"]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const id = row.dataset.did; const dev = state.devicesRaw.find(d=>d.id===id); if(dev) openDeviceDetails(dev);
        });
      });
    });
  }

  async function openSuspiciousDetails(acc){
    const username = await getUsername(acc.id);
    // Avatar: use a placeholder or initials if not available
    const avatarUrl = acc.metadata && acc.metadata.avatarUrl ? acc.metadata.avatarUrl : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=0D8ABC&color=fff&size=96';
    const levelClass = `level-${acc.suspicionLevel}`;
    const levelLabel = `Niveau ${acc.suspicionLevel}`;
    const badgeColor = acc.suspicionLevel >= 5 ? '#ef5350' : acc.suspicionLevel === 4 ? '#fb8c00' : acc.suspicionLevel === 3 ? '#fdd835' : acc.suspicionLevel === 2 ? '#ffee58' : '#8bc34a';
    const relatedHtml = acc.relatedAccounts.length ? `<div class='phase2-modal-linked-title'>Comptes liés:</div><div class='phase2-modal-linked-list'>${acc.relatedAccounts.map(a=>`<div class='phase2-modal-linked-item'><span class='material-icons'>person</span> @${a.substring(0,10)}...</div>`).join('')}</div>`:'';
    openModal('Compte suspect @'+username, `
      <div class="phase2-modal-modern">
        <div class="phase2-modal-modern-header">
          <img class="phase2-modal-avatar" src="${avatarUrl}" alt="avatar" />
          <div class="phase2-modal-userinfo">
            <div class="phase2-modal-username">@${username}</div>
            <div class="phase2-modal-id">ID: ${acc.id.substring(0,10)}...</div>
          </div>
          <span class="phase2-modal-badge ${levelClass}" style="background:${badgeColor};">${levelLabel}</span>
        </div>
        <div class="phase2-modal-modern-body">
          <div class="phase2-modal-info-row"><span>Appareil:</span> <b>${acc.deviceId.substring(0,12)}...</b></div>
          <div class="phase2-modal-info-row"><span>Détecté le:</span> <b>${formatDate(acc.detectedAt)}</b></div>
          <div class="phase2-modal-info-row"><span>Statut:</span> <b>${acc.status ? acc.status.toUpperCase() : 'PENDING'}</b></div>
          <div class="phase2-modal-reasons">
            <div class="phase2-modal-reasons-title">Raisons:</div>
            ${acc.reasons.map(r=>`<div class='phase2-modal-reason'><span class='material-icons warning'>warning</span> ${r}</div>`).join('')}
          </div>
          ${relatedHtml}
        </div>
      </div>
    `);
  }

  async function openDeviceDetails(dev){
    const accountsHtml = await Promise.all(dev.accounts.map(async uid=>`<li>@${await getUsername(uid)} <span class='uid'>(${uid.substring(0,8)}...)</span></li>`));
    openModal('Appareil '+dev.deviceId.substring(0,12)+'...', `
      <div class='detail-grid'>
        <div><strong>Plateforme</strong><span>${dev.platform}</span></div>
        <div><strong>Modèle</strong><span>${dev.model||'—'}</span></div>
        <div><strong>Première</strong><span>${formatDate(dev.firstRegistration)}</span></div>
        <div><strong>Dernière</strong><span>${formatDate(dev.lastActivity)}</span></div>
        <div><strong>Comptes</strong><span>${dev.accounts.length}</span></div>
      </div>
      <h4>Comptes associés</h4>
      <ul class='accounts-list'>${accountsHtml.join('')}</ul>
    `);
  }

  // ========= BIND CONTROLS =========
  function bindControls(){
    const searchSusp = document.getElementById('suspicious-search');
    if(searchSusp){ searchSusp.addEventListener('input', ()=>{ state.suspiciousSearch = searchSusp.value; state.suspiciousPage=0; applySuspiciousFilters(); renderSuspicious(); }); }
    const levelFilter = document.getElementById('suspicion-level-filter');
    if(levelFilter){ levelFilter.addEventListener('change', ()=>{ state.suspiciousLevelFilter = parseInt(levelFilter.value,10); applySuspiciousFilters(); renderSuspicious(); }); }
    const searchDev = document.getElementById('device-search');
    if(searchDev){ searchDev.addEventListener('input', ()=>{ state.deviceSearch = searchDev.value; state.devicesPage=0; applyDeviceFilters(); renderDevices(); }); }
    const minAccounts = document.getElementById('min-accounts-filter');
    if(minAccounts){ minAccounts.addEventListener('change', ()=>{ state.minAccounts = parseInt(minAccounts.value,10); applyDeviceFilters(); renderDevices(); }); }
    const refreshBtn = document.getElementById('refresh-phase2'); if(refreshBtn){ refreshBtn.addEventListener('click', ()=>{ loadSuspicious(); loadDevices(); }); }
  }

  async function initialize(){ if(initialize._ran) return; initialize._ran=true; bindControls(); await loadSuspicious(); await loadDevices(); }
  // Expose debug reload for dev
  window.Phase2AntiMultiDebug = { state, reloadSuspicious: loadSuspicious };

  window.Phase2AntiMulti = { initialize, reload: ()=>{ loadSuspicious(); loadDevices(); } };
})();
