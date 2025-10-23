// Phase 1 Moderation (User Reputation & Recent Actions) Web Module
// Parité avec l'implémentation Flutter (moderation_dashboard.dart)
// Fournit des cartes utilisateurs (user_reputation) + cartes d'actions (user_actions_log)

(function(){
  if(!window.FirebaseServices){
    console.warn('[Phase1Moderation] FirebaseServices indisponible pour le moment.');
  }

  const COLLECTIONS = {
    userReputation: () => FirebaseServices.collections.userReputation,
    userActionsLog: () => FirebaseServices.collections.userActionsLog,
    users: () => FirebaseServices.collections.users
  };

  const state = {
    users: [],          // Ensemble filtré/trié courant
    rawUsers: [],       // Ensemble brut
    actions: [],
    usernameCache: new Map(),
    // Filtres utilisateurs
    search: '',
    problematicOnly: true,
    sortBy: 'score', // score | reportCount | lastActivity | validatedReports
    sortDesc: false,
    usersPerPage: 20,
    usersPage: 0,
    // Filtres actions
    actionSearch: '', // (simple: réutilise same search)
    actionsPerPage: 25,
    actionsPage: 0,
    loadingUsers: false,
    loadingActions: false,
    metrics: null,
  };

  // ============== UTILITIES ==============
  function formatDate(date){
    if(!(date instanceof Date)) return '--';
    return `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}`;
  }

  async function getUsername(uid){
    if(state.usernameCache.has(uid)) return state.usernameCache.get(uid);
    try {
      const snap = await FirebaseServices.firestore.collection(COLLECTIONS.users()).doc(uid).get();
      const username = snap.exists ? (snap.data().username || snap.data().displayName || ('user_'+uid.substring(0,6))) : ('user_'+uid.substring(0,6));
      state.usernameCache.set(uid, username);
      return username;
    } catch(e){
      const fallback = 'user_'+uid.substring(0,6);
      state.usernameCache.set(uid,fallback);
      return fallback;
    }
  }

  function computeMetrics(){
    const now = Date.now();
    const low = state.rawUsers.filter(u=>u.score < 50).length;
    const banned = state.rawUsers.filter(u=>{
      const r = u.restrictions || {};
      const bu = r.bannedUntil;
      try {
        if(!bu) return false;
        if(bu.toDate) return bu.toDate().getTime() > now;
        if(bu instanceof Date) return bu.getTime() > now;
        if(typeof bu === 'number') return bu > now;
      } catch(_) { return false; }
      return false;
    }).length;
    state.metrics = { lowReputation: low, bannedUsers: banned, totalUsers: state.rawUsers.length };
    renderMetrics();
  }

  // ============== FIRESTORE LOADERS ==============
  async function loadUsers(){
    if(!window.FirebaseServices) return;
    state.loadingUsers = true; renderUsersLoading();
    try {
      // Charger un buffer fixe (ex: 300) pour stats fiables
      const snap = await FirebaseServices.firestore.collection(COLLECTIONS.userReputation()).limit(300).get();
      console.log('[Phase1Moderation] user_reputation docs:', snap.size);
      state.rawUsers = snap.docs.map(doc=>mapUserReputation(doc));
      applyUserFilters();
      computeMetrics();
    } catch(e){
      console.error('[Phase1Moderation] Erreur chargement user_reputation', e);
      state.rawUsers = [];
      state.users = [];
      computeMetrics();
    } finally {
      state.loadingUsers = false; renderUsers();
    }
  }

  function mapUserReputation(doc){
    const d = doc.data();
    return {
      id: doc.id,
      score: d.score ?? 100,
      reportCount: d.reportCount ?? 0,
      validatedReports: d.validatedReports ?? 0,
      flaggedReports: d.flaggedReports ?? 0,
      voteCount: d.voteCount ?? 0,
      lastActivity: (d.lastActivity && d.lastActivity.toDate) ? d.lastActivity.toDate() : new Date(0),
      restrictions: d.restrictions || {},
    };
  }

  async function loadActions(){
    if(!window.FirebaseServices) return;
    state.loadingActions = true; renderActionsLoading();
    try {
      const limit = state.actionsPerPage * 3;
      let query = FirebaseServices.firestore.collection(COLLECTIONS.userActionsLog())
        .orderBy('timestamp','desc')
        .limit(limit);
      const snap = await query.get();
      console.log('[Phase1Moderation] actions docs loaded:', snap.size);
      state.actions = snap.docs.map(doc=>{
        const data = doc.data();
        return {
          id: doc.id,
            action: data.action || data.actionType || 'unknown',
            userId: data.userId || 'unknown',
            targetId: data.targetId || null,
            timestamp: (data.timestamp && data.timestamp.toDate) ? data.timestamp.toDate() : new Date(),
            metadata: data.metadata || data.details || {},
        };
      });
      renderActions();
    } catch(e){
      console.error('[Phase1Moderation] Erreur chargement user_actions_log', e);
      state.actions = [];
      renderActions();
    } finally {
      state.loadingActions = false;
      // Re-render pour enlever le loader si une erreur est survenue après le premier render
      renderActions();
    }
  }

  // ============== FILTERS & SORT ==============
  function applyUserFilters(){
    const q = state.search.trim().toLowerCase();
    let arr = state.rawUsers.filter(u=>{
      if(state.problematicOnly && u.score >= 50) return false; // si pas filtré côté serveur
      if(!q) return true;
      return u.id.toLowerCase().includes(q);
    });
    arr.sort((a,b)=>{
      let cmp = 0;
      switch(state.sortBy){
        case 'score': cmp = a.score - b.score; break;
        case 'reportCount': cmp = a.reportCount - b.reportCount; break;
        case 'lastActivity': cmp = a.lastActivity - b.lastActivity; break;
        case 'validatedReports': cmp = a.validatedReports - b.validatedReports; break;
      }
      return state.sortDesc ? -cmp : cmp;
    });
    state.users = arr;
    if(state.usersPage * state.usersPerPage >= state.users.length){
      state.usersPage = 0;
    }
    renderUsers();
  }

  // ============== RENDERING ==============
  function qs(id){ return document.getElementById(id); }

  function renderMetrics(){
    if(!state.metrics) return;
    const {lowReputation, bannedUsers, totalUsers} = state.metrics;
    const elLow = qs('metric-low-rep'); if(elLow) elLow.textContent = lowReputation;
    const elBan = qs('metric-banned-users'); if(elBan) elBan.textContent = bannedUsers;
    const elTot = qs('metric-total-users-phase1'); if(elTot) elTot.textContent = totalUsers;
  }

  function renderUsersLoading(){
    const container = qs('phase1-users-cards');
    if(container){
      container.innerHTML = '<div class="loading-inline">Chargement utilisateurs...</div>';
    }
  }

  function renderActionsLoading(){
    const container = qs('phase1-actions-cards');
    if(container){
      container.innerHTML = '<div class="loading-inline">Chargement actions...</div>';
    }
  }

  function scoreColor(score){
    if(score >= 80) return 'var(--accent-green)';
    if(score >= 50) return 'var(--accent-orange)';
    return 'var(--accent-red)';
  }

  async function buildUserCard(user){
    const username = await getUsername(user.id);
    const restrictions = user.restrictions || {};
    let bannedUntil = null;
    if(restrictions.bannedUntil){
      try { bannedUntil = restrictions.bannedUntil.toDate ? restrictions.bannedUntil.toDate() : (restrictions.bannedUntil instanceof Date ? restrictions.bannedUntil : new Date(restrictions.bannedUntil)); } catch(_) {}
    }
    return `<div class="reputation-card" data-uid="${user.id}">
      <div class="rc-left">
        <div class="rc-username">@${username}</div>
        <div class="rc-id">ID: ${user.id.substring(0,8)}...</div>
        <div class="rc-stats">Sig.: ${user.reportCount} • Votes: ${user.voteCount} • Validés: ${user.validatedReports}</div>
        <div class="rc-activity">Dernière: ${formatDate(user.lastActivity)}</div>
      </div>
      <div class="rc-right">
        <div class="rc-score" style="--score-color:${scoreColor(user.score)}">${user.score}</div>
        <div class="rc-actions">
          <button class="btn-mini" data-action="details" title="Détails"><span class="material-icons">info</span></button>
          <button class="btn-mini subtle" data-action="history" title="Historique"><span class="material-icons">history</span></button>
        </div>
        ${bannedUntil ? `<div class="rc-banned">Banni jusqu'au ${formatDate(bannedUntil)}</div>`:''}
      </div>
    </div>`;
  }

  function renderUsers(){
    // Support backward compatibility: HTML utilise 'phase1-users-cards' (nouveau) ou 'problem-users-list' (ancien)
    const list = qs('phase1-users-cards') || qs('problem-users-list');
    const empty = qs('phase1-users-empty') || qs('problem-users-empty');
    if(!list) return;
    if(state.loadingUsers){ return; }
    if(state.users.length === 0){
      list.innerHTML=''; if(empty) empty.style.display='block';
      renderUsersPagination();
      return;
    }
    if(empty) empty.style.display='none';
    const start = state.usersPage * state.usersPerPage;
    const end = Math.min(start + state.usersPerPage, state.users.length);
    const slice = state.users.slice(start,end);
    // Construire cartes de manière asynchrone (usernames)
    Promise.all(slice.map(u=>buildUserCard(u))).then(htmlArr=>{
      list.innerHTML = htmlArr.join('');
      attachUserCardEvents();
    });
    renderUsersPagination();
    updateUsersInfo();
  }

  function updateUsersInfo(){
    const info = qs('users-pagination-info');
    const pageInfo = qs('users-page-info');
    if(info) info.textContent = `${state.users.length} utilisateurs`; // réutilise zone existante
    if(pageInfo) pageInfo.textContent = `Page ${state.usersPage+1}/${Math.max(1, Math.ceil(state.users.length / state.usersPerPage))}`;
  }

  function renderUsersPagination(){
    const prevBtn = qs('users-prev-page');
    const nextBtn = qs('users-next-page');
    const totalPages = Math.ceil(state.users.length / state.usersPerPage) || 1;
    if(prevBtn){ prevBtn.disabled = state.usersPage === 0; prevBtn.onclick = ()=>{ state.usersPage--; renderUsers(); }; }
    if(nextBtn){ nextBtn.disabled = state.usersPage >= totalPages-1; nextBtn.onclick = ()=>{ state.usersPage++; renderUsers(); }; }
  }

  async function buildActionCard(action){
    const username = await getUsername(action.userId);
    const timeAgoMin = Math.max(1, Math.floor((Date.now() - action.timestamp.getTime()) / 60000));
    let icon = 'info'; let colorClass='neutral';
    switch(action.action){
      case 'report': icon='report'; colorClass='blue'; break;
      case 'vote_confirm': icon='thumb_up'; colorClass='green'; break;
      case 'vote_deny': icon='thumb_down'; colorClass='red'; break;
      case 'block_user': icon='block'; colorClass='red'; break;
      case 'unblock_user': icon='lock_open'; colorClass='green'; break;
    }
    return `<div class="action-card ${colorClass}" data-aid="${action.id}">
      <div class="ac-left">
        <span class="material-icons ac-icon">${icon}</span>
      </div>
      <div class="ac-main">
        <div class="ac-title">${action.action} par @${username}</div>
        <div class="ac-sub">UID: ${action.userId.substring(0,8)}... • ${timeAgoMin} min</div>
        ${action.metadata && action.metadata.platform ? `<div class="ac-meta">Device: ${action.metadata.platform}</div>`:''}
      </div>
      <div class="ac-right">
        <button class="btn-mini" data-action="details" title="Détails"><span class="material-icons">open_in_new</span></button>
      </div>
    </div>`;
  }

  function renderActions(){
    const list = qs('phase1-actions-cards');
    const empty = qs('phase1-actions-empty');
    if(!list) return;
  if(state.loadingActions){ list.innerHTML='<div class="loading-inline">Chargement actions...</div>'; return; }
    // Filtre recherche global
    const q = state.search.trim().toLowerCase();
    let arr = state.actions.filter(a=>!q || a.userId.toLowerCase().includes(q));
    // Pagination client
    if(state.actionsPage * state.actionsPerPage >= arr.length){ state.actionsPage = 0; }
    const start = state.actionsPage * state.actionsPerPage;
    const end = Math.min(start + state.actionsPerPage, arr.length);
    const page = arr.slice(start,end);
    if(arr.length === 0){
      list.innerHTML=''; if(empty) empty.style.display='block';
      renderActionsPagination(arr.length);
      return;
    }
    if(empty) empty.style.display='none';
    Promise.all(page.map(a=>buildActionCard(a))).then(htmlArr=>{
      list.innerHTML = htmlArr.join('');
      attachActionCardEvents(arr);
    });
    renderActionsPagination(arr.length);
  }

  function renderActionsPagination(total){
    const info = qs('phase1-actions-page-info');
    const prev = qs('phase1-actions-prev');
    const next = qs('phase1-actions-next');
    const totalPages = Math.ceil(total / state.actionsPerPage) || 1;
    if(info) info.textContent = `Page ${state.actionsPage+1}/${totalPages}`;
    if(prev){ prev.disabled = state.actionsPage===0; prev.onclick = ()=>{ state.actionsPage--; renderActions(); }; }
    if(next){ next.disabled = state.actionsPage>=totalPages-1; next.onclick = ()=>{ state.actionsPage++; renderActions(); }; }
  }

  // ============== EVENTS & MODALS ==============
  function attachUserCardEvents(){
    const container = qs('phase1-users-cards') || qs('problem-users-list');
    if(!container) return;
    container.querySelectorAll('.reputation-card .btn-mini').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const action = btn.dataset.action;
        const card = btn.closest('.reputation-card');
        if(!card) return;
        const uid = card.dataset.uid;
        const user = state.rawUsers.find(u=>u.id===uid);
        if(!user) return;
        if(action==='details'){ openUserDetailsModal(user); }
        else if(action==='history'){ openUserHistoryModal(uid); }
      });
    });
  }

  function attachActionCardEvents(){
    const container = qs('phase1-actions-cards');
    if(!container) return;
    container.querySelectorAll('.action-card .btn-mini').forEach(btn=>{
      btn.addEventListener('click',(e)=>{
        e.stopPropagation();
        const card = btn.closest('.action-card');
        if(!card) return;
        const id = card.dataset.aid;
        const action = state.actions.find(a=>a.id===id);
        if(action){ openActionDetailsModal(action); }
      });
    });
  }

  function ensureBaseModal(){
    if(!document.getElementById('generic-modal')){
      const div = document.createElement('div');
      div.id='generic-modal';
      div.className='modal';
      div.innerHTML=`<div class="modal-content"><div class="modal-header"><h3 id="generic-modal-title"></h3><button class="modal-close" data-close>&times;</button></div><div class="modal-body" id="generic-modal-body"></div></div>`;
      document.body.appendChild(div);
      div.addEventListener('click', e=>{ if(e.target.dataset.close!==undefined || e.target===div) closeGenericModal(); });
    }
  }
  function openGenericModal(title, bodyHtml){
    ensureBaseModal();
    const modal = document.getElementById('generic-modal');
    modal.querySelector('#generic-modal-title').textContent = title;
    modal.querySelector('#generic-modal-body').innerHTML = bodyHtml;
    modal.style.display='flex';
  }
  function closeGenericModal(){ const m=document.getElementById('generic-modal'); if(m) m.style.display='none'; }

  async function openUserDetailsModal(user){
    const username = await getUsername(user.id);
    const r = user.restrictions || {};
    const bannedUntil = r.bannedUntil && r.bannedUntil.toDate ? formatDate(r.bannedUntil.toDate()) : '—';
    openGenericModal('Utilisateur @'+username,`
      <div class='detail-grid'>
        <div><strong>ID</strong><span>${user.id}</span></div>
        <div><strong>Score</strong><span>${user.score}</span></div>
        <div><strong>Signalements</strong><span>${user.reportCount}</span></div>
        <div><strong>Validés</strong><span>${user.validatedReports}</span></div>
        <div><strong>Votes</strong><span>${user.voteCount}</span></div>
        <div><strong>Dernière activité</strong><span>${formatDate(user.lastActivity)}</span></div>
        <div><strong>Banni jusqu'au</strong><span>${bannedUntil}</span></div>
        <div><strong>Peut signaler</strong><span>${r.canReport!==false ? 'Oui':'Non'}</span></div>
        <div><strong>Peut voter</strong><span>${r.canVote!==false ? 'Oui':'Non'}</span></div>
        <div><strong>Modération requise</strong><span>${r.needsModeration? 'Oui':'Non'}</span></div>
      </div>
    `);
  }

  async function openUserHistoryModal(uid){
    // Charger 100 dernières actions utilisateur
    try {
      const snap = await FirebaseServices.firestore
        .collection(COLLECTIONS.userActionsLog())
        .where('userId','==',uid)
        .orderBy('timestamp','desc')
        .limit(100).get();
      const actions = snap.docs.map(d=>({ id: d.id, ...d.data(), timestamp: d.data().timestamp?.toDate?.() || new Date()}));
      const rows = actions.map(a=>`<tr><td>${a.action||a.actionType}</td><td>${formatDate(a.timestamp)}</td><td>${a.targetId||''}</td></tr>`).join('');
      openGenericModal('Historique '+uid.substring(0,8)+'...', `<table class='history-table'><thead><tr><th>Action</th><th>Date</th><th>Cible</th></tr></thead><tbody>${rows||''}</tbody></table>`);
    } catch(e){
      openGenericModal('Historique', '<p>Erreur chargement historique.</p>');
    }
  }

  async function openActionDetailsModal(action){
    const username = await getUsername(action.userId);
    const meta = action.metadata || {};
    const metaHtml = Object.keys(meta).length ? `<div class='meta-box'>${Object.entries(meta).map(([k,v])=>`<div><strong>${k}</strong>: ${String(v)}</div>`).join('')}</div>` : '<em>Aucune métadonnée</em>';
    openGenericModal('Action @'+username, `
      <p><strong>Action:</strong> ${action.action}</p>
      <p><strong>UserID:</strong> ${action.userId}</p>
      <p><strong>Target:</strong> ${action.targetId || '—'}</p>
      <p><strong>Date:</strong> ${formatDate(action.timestamp)}</p>
      <h4>Métadonnées</h4>
      ${metaHtml}
    `);
  }

  // ============== UI CONTROLS BINDING ==============
  function bindControls(){
    const searchInput = qs('user-search');
    if(searchInput){
      searchInput.addEventListener('input', ()=>{ state.search = searchInput.value; state.usersPage=0; applyUserFilters(); renderActions(); });
    }
    const refreshBtn = qs('refresh-phase1');
    if(refreshBtn){ refreshBtn.addEventListener('click', ()=>{ loadUsers(); loadActions(); }); }
  }

  // ============== INIT ==============
  async function initialize(){
     console.log('[Phase1Moderation] initialize() called');
     // Protéger exécutions multiples
     if(initialize._ran) return; initialize._ran = true;
    bindControls();
  await loadUsers();
  // Charger les actions en parallèle sans bloquer le rendu initial des users
  loadActions();
  }

  // Exposer dans le scope global
  window.Phase1Moderation = { initialize, reload: ()=>{ loadUsers(); loadActions(); } };
})();
