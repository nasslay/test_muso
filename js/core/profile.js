// Composant profil utilisateur unifié
// Usage: openProfileModal(userId, { showModerationButtons: true })

// Attendre que tous les services soient chargés
function waitForServices() {
  return new Promise((resolve) => {
    function check() {
      if (typeof AdminActionsService !== 'undefined' && typeof firebase !== 'undefined') {
        resolve();
      } else {
        setTimeout(check, 50);
      }
    }
    check();
  });
}

(function(){
	const cache = new Map();

	const ACTIONS = {
		QUARANTINE:'quarantine', UNQUARANTINE:'unquarantine',
		BAN_24:'ban24h', BAN_7:'ban7d', BAN_PERM:'banPermanent', UNBAN:'unban',
		BLOCK_REPORTS:'blockReports', UNBLOCK_REPORTS:'unblockReports',
		BLOCK_VOTES:'blockVotes', UNBLOCK_VOTES:'unblockVotes',
		FORCE_MOD:'forceModeration', REMOVE_MOD:'removeModeration',
		RESET_REP:'resetReputation', ADD_NOTE:'addNote'
	};

	async function fetchUser(userId){
		if(cache.has(userId)) return cache.get(userId);
		const firestore = firebase.firestore();
		let userData = null, reputation = null, recentActions = [], adminActions = [], adminNotes = [], stats = null;
		try {
			const userDoc = await firestore.collection('users').doc(userId).get();
			if(!userDoc.exists) throw new Error('Utilisateur introuvable');
			userData = userDoc.data();
			console.log('[Profil] userData récupéré:', userData);
		} catch(e) {
			console.error('[Profil] Erreur récupération userData:', e);
		}
		try {
			const repDoc = await firestore.collection('user_reputation').doc(userId).get();
			if(repDoc.exists) reputation = repDoc.data();
			console.log('[Profil] reputation récupérée:', reputation);
		} catch(e){
			console.warn('[Profil] Réputation indisponible', e);
		}
		try {
			// Nouvelle récupération des stats utilisateur (si collection existe)
			const statsDoc = await firestore.collection('user_stats').doc(userId).get();
			if(statsDoc.exists) {
				stats = statsDoc.data();
				console.log('[Profil] Statistiques récupérées:', stats);
			} else {
				console.log('[Profil] Aucun document user_stats trouvé pour', userId);
			}
		} catch(e) {
			console.warn('[Profil] Erreur récupération user_stats:', e);
		}
		try {
			const snap = await firestore.collection('user_actions_log').where('userId','==',userId).orderBy('timestamp','desc').limit(20).get();
			recentActions = snap.docs.map(d=>({id:d.id,...d.data()}));
			console.log('[Profil] recentActions récupérées:', recentActions.length);
		} catch(e){
			console.warn('[Profil] Erreur récupération recentActions:', e);
		}
		try {
			// Support ancien champ targetId et nouveau champ userId
			const q1 = firestore.collection('admin_actions').where('targetId','==',userId).orderBy('timestamp','desc').limit(30);
			const q2 = firestore.collection('admin_actions').where('userId','==',userId).orderBy('timestamp','desc').limit(30);
			let results = [];
			try { const s1 = await q1.get(); results = results.concat(s1.docs); } catch(_){ }
			try { const s2 = await q2.get(); results = results.concat(s2.docs); } catch(_){ }
			// dédoublonner par id
			const uniq = {}; results.forEach(d=>{ uniq[d.id]=d; });
			adminActions = Object.values(uniq).map(d=>({id:d.id,...d.data()})).sort((a,b)=> (b.timestamp?.toMillis?.()||0)-(a.timestamp?.toMillis?.()||0));
			console.log('[Profil] adminActions récupérées:', adminActions.length);
		} catch(e){
			console.warn('[Profil] Admin actions load failed', e);
		}
		try {
			const snap = await firestore.collection('admin_notes').where('userId','==',userId).orderBy('timestamp','desc').limit(15).get();
			adminNotes = snap.docs.map(d=>({id:d.id,...d.data()}));
			console.log('[Profil] adminNotes récupérées:', adminNotes.length);
		} catch(e){
			console.warn('[Profil] Erreur récupération adminNotes:', e);
		}
		const full = {userId,userData,reputation,recentActions,adminActions,adminNotes,stats};
		cache.set(userId, full);
		return full;
	}

	function reputationColor(score){
		if(score == null) return '#ccc';
		return '#fff'; // actual background handled by gradient classes now
	}
	function formatRestriction(key){
		const map = {
			canReport:'Peut signaler',
			canComment:'Peut commenter',
			canPost:'Peut publier',
			canMessage:'Peut envoyer messages',
			canJoinEvents:'Peut rejoindre évènements',
			canVote:'Peut voter',
			reviewPending:'Modération requise',
			forceModeration:'Modération requise',
			needsModeration:'Modération requise',
			isBanned:'Banni',
			quarantine:'Quarantaine'
		};
		return map[key] || key;
	}
	function restrictionsList(rep){
		if(!rep?.restrictions){
			return `<div class="empty-card"><span class="material-icons">hourglass_empty</span>Aucune donnée</div>`;
		}
		const r = rep.restrictions; const keys = Object.keys(r).filter(k=>typeof r[k]==='boolean');
		if(!keys.length) return `<div class="empty-card"><span class="material-icons">hourglass_empty</span>Aucune donnée</div>`;
		return keys.map(k=>{
			const val = r[k];
			let allowed;
			if(k==='isBanned') { allowed = !val; } else { allowed = val===true; }
			const label = formatRestriction(k);
			const stateLabel = allowed? 'Oui' : 'Non';
			return `<div class="restriction-item ${allowed?'allowed':'blocked'}"><span class="material-icons" style="font-size:16px;">${allowed?'check_circle':'block'}</span>${label}: <strong class="yn ${allowed?'yes':'no'}">${stateLabel}</strong></div>`;
		}).join('');
	}
	function formatTs(ts){ if(!ts) return '—'; if(ts.toDate) ts=ts.toDate(); return new Date(ts).toLocaleString('fr-FR'); }
	function buildActivities(list){
		if(!list?.length) return '<div class="card empty-activity"><span class="material-icons" style="font-size:18px;opacity:.6;">history</span><span style="opacity:.7;">Aucune action récente</span></div>';
		return `<div class="card activity-card"><ul class="activity-list">${list.map(a=>`<li class="activity-row"><span class="act-type">${a.type||a.action||'action'}</span><span class="act-time">${formatTs(a.timestamp?.toDate?.()||a.timestamp)}</span></li>`).join('')}</ul></div>`;
	}
	function buildAdminHistory(actions=[], notes=[]){
		const actionsHtml = (actions||[]).length? actions.map(a=>`<div class="history-item"><span class="material-icons" style="font-size:16px;">gavel</span><strong>${a.actionType||a.action||a.type||'action'}</strong><span style="opacity:.6;">${formatTs(a.timestamp?.toDate?.()||a.timestamp)}</span></div>`).join('') : '';
		const notesHtml = (notes||[]).length? notes.map(n=>`<div class="history-item"><span class="material-icons" style="font-size:16px;">note</span><strong>${n.category||'note'}</strong><span>${n.note||''}</span><span style="opacity:.5;">${formatTs(n.timestamp?.toDate?.()||n.timestamp)}</span></div>`).join('') : '';
		return actionsHtml + notesHtml; // ne rien afficher si vide
	}
	function buildQuickActions(userId, rep, isAdmin){
		const r = rep?.restrictions||{}; 
		const blockedReports = r.canReport===false; 
		const blockedVotes = r.canVote===false; 
		const forced = r.reviewPending===true || r.forceModeration===true; 
		const fullyBanned = r.isBanned === true || (r.canPost===false && r.canComment===false && r.canReport===false && r.canMessage===false);
		const quarantined = r.quarantine === true;
		return `<div class="quick-actions-grid">
			<button class="action-btn ${quarantined?'secondary':'danger'}" data-profile-action="${quarantined?ACTIONS.UNQUARANTINE:ACTIONS.QUARANTINE}" data-user="${userId}">${quarantined?'Fin quarantaine':'Quarantaine'}</button>
			<button class="action-btn danger" data-profile-action="${ACTIONS.BAN_24}" data-user="${userId}">Bannir 24h</button>
			<button class="action-btn danger" data-profile-action="${ACTIONS.BAN_7}" data-user="${userId}">Bannir 7j</button>
			<button class="action-btn danger" data-profile-action="${ACTIONS.BAN_PERM}" data-user="${userId}">Bannissement permanent</button>
			${fullyBanned?`<button class="action-btn" data-profile-action="${ACTIONS.UNBAN}" data-user="${userId}">Débannir</button>`:''}
			<button class="action-btn ${blockedReports?'secondary':''}" data-profile-action="${blockedReports?ACTIONS.UNBLOCK_REPORTS:ACTIONS.BLOCK_REPORTS}" data-user="${userId}">${blockedReports?'Débloquer signalements':'Bloquer signalements'}</button>
			<button class="action-btn ${blockedVotes?'secondary':''}" data-profile-action="${blockedVotes?ACTIONS.UNBLOCK_VOTES:ACTIONS.BLOCK_VOTES}" data-user="${userId}">${blockedVotes?'Débloquer votes':'Bloquer votes'}</button>
			<button class="action-btn ${forced?'secondary':''}" data-profile-action="${forced?ACTIONS.REMOVE_MOD:ACTIONS.FORCE_MOD}" data-user="${userId}">${forced?'Retirer modération':'Forcer modération'}</button>
			<button class="action-btn" data-profile-action="${ACTIONS.RESET_REP}" data-user="${userId}">Réinitialiser réputation</button>
			<button class="action-btn" data-profile-action="${ACTIONS.ADD_NOTE}" data-user="${userId}">Ajouter une note</button>
			${isAdmin?`<button class="action-btn" data-profile-action="revoke" data-user="${userId}">Révoquer admin</button>`:''}
		</div>`;
	}
	function buildReputationPanel(reputation){
		// Normalisation des champs possibles (compat web/mobile / anciennes versions)
		const raw = reputation || {};
		const score = (raw.reputationScore ?? raw.score ?? raw.points ?? 0);
		// Certains schémas utilisent totalReports, d'autres reportsCreated / createdReports
		const stats = raw.stats || raw.reportStats || {};
		const created = (raw.totalReports ?? raw.reportsCreated ?? raw.createdReports ?? stats.total ?? stats.created ?? 0);
		const validated = (raw.reportsValidated ?? raw.validatedReports ?? raw.approvedReports ?? stats.validated ?? stats.approved ?? 0);
		const flagged = (raw.reportsFlagged ?? raw.flaggedReports ?? raw.reportedReports ?? stats.flagged ?? stats.reported ?? 0);
		const votes = (raw.votes ?? raw.voteCount ?? raw.totalVotes ?? stats.votes ?? stats.totalVotes ?? 0);
		let gradientClass = 'gradient-low';
		if(score >= 25) gradientClass='gradient-mid';
		if(score >= 60) gradientClass='gradient-high';
		if(score >= 100) gradientClass='gradient-top';
		return `<div class="reputation-panel">
			<div class="rep-score-tile ${gradientClass}"><span class="rep-points">${score}</span><span class="rep-label">points</span></div>
			<div class="rep-stats">
				<div class="rep-row"><span>Signalements créés</span><strong>${created}</strong></div>
				<div class="rep-row"><span>Signalements validés</span><strong>${validated}</strong></div>
				<div class="rep-row"><span>Signalements signalés</span><strong>${flagged}</strong></div>
				<div class="rep-row"><span>Votes</span><strong>${votes}</strong></div>
			</div>
		</div>`;
	}

	async function buildModal(data, options){
		const {userId,userData,reputation,recentActions,adminActions,adminNotes} = data;
		// Fallback complet du score
		const normalizedScore = (reputation?.reputationScore ?? reputation?.score ?? reputation?.points ?? 0);
		const repScore = normalizedScore;
		const repColor = reputationColor(normalizedScore);
		let totalReports = (reputation?.totalReports ?? reputation?.reportsCreated ?? reputation?.createdReports ?? reputation?.stats?.total ?? 0);
		let violationCount = (reputation?.violationCount ?? reputation?.violations ?? 0);
		const isBlocked = reputation?.restrictions?.canReport === false;
		const bannedUntil = reputation?.restrictions?.bannedUntil || reputation?.restrictions?.banUntil;
		const forced = reputation?.restrictions?.reviewPending || reputation?.restrictions?.forceModeration;
		const description = userData.description || userData.bio || '';
		// Détection viewer admin (utilisateur connecté)
		let viewerIsAdmin=false; try { const me = firebase.auth().currentUser; if(me){ const doc = await firebase.firestore().collection('users').doc(me.uid).get(); viewerIsAdmin = doc.exists && doc.data().isAdmin === true; } } catch(e){}
		const targetIsAdmin = userData.isAdmin === true;
		const showAdminPanel = viewerIsAdmin || targetIsAdmin || options?.showModerationButtons;
		// Recompute reports count si 0 et user a potentiellement des reports (sécurité)
		if(totalReports===0){
			try {
				const snap = await firebase.firestore().collection('report').where('userId','==',userId).limit(300).get();
				totalReports = snap.size;
				if(totalReports>0) violationCount = violationCount; // placeholder si on veut dériver plus tard
			} catch(e) { console.warn('Recompute reports échoué', e); }
		}
		// Préparer stats activité
		const activityCount = recentActions?.length || 0;
		let lastActivityLabel = '—';
		if(recentActions?.length){
			const latestTs = recentActions[0].timestamp?.toDate?.()||recentActions[0].timestamp;
			if(latestTs){
				const diffMs = Date.now() - new Date(latestTs).getTime();
				const diffHours = Math.floor(diffMs/3600000);
				if(diffHours<1) lastActivityLabel = "<1h"; else if(diffHours<24) lastActivityLabel = diffHours+"h"; else { const days=Math.floor(diffHours/24); lastActivityLabel = days+"j"; }
			}
		}
		const modal = document.createElement('div');
		modal.className='modal'; modal.style.display='flex';
		modal.innerHTML = `<div class="modal-content profile-modal">
			<div class="modal-header"><h2>Profil utilisateur</h2><button class="close-btn" data-close-profile>&times;</button></div>
			<div class="modal-body">
				<div class="profile-header">
					<div class="avatar">${userData.profilePicture||userData.profile_pic?`<img src="${userData.profilePicture||userData.profile_pic}" alt="${userData.username}">`:'<span class="material-icons">account_circle</span>'}</div>
					<div class="identity"><h2>${userData.username||'Utilisateur'}</h2><code>${userId}</code><div class="chips">${targetIsAdmin?'<span class="chip admin">Admin</span>':''}${isBlocked?'<span class="chip blocked">Banni</span>':''}${forced?'<span class="chip suspicious-medium">Modération requise</span>':''}</div>${description?`<div class="user-description"><span class="material-icons" style="font-size:16px;opacity:.7;">info</span><div>${description}</div></div>`:''}</div>
				</div>
				<div class="tab-bar">
					<button class="tab-btn active" data-tab="overview">Aperçu</button>
					<button class="tab-btn" data-tab="restrictions">Restrictions</button>
					<button class="tab-btn" data-tab="activity">Activité</button>
					<button class="tab-btn" data-tab="admin">Administrateur</button>
				</div>
				<div class="tab-panels">
					<div class="tab-panel active" data-panel="overview">
						<div class="profile-grid">
							<div class="item"><label>Email</label><span class="value">${userData.email||'N/A'}</span></div>
							<div class="item"><label>Réputation</label><span class="value" style="color:${repColor}">${repScore}</span></div>
							<div class="item"><label>Signalements</label><span class="value">${totalReports}</span></div>
							<div class="item"><label>Violations</label><span class="value">${violationCount}</span></div>
							<div class="item"><label>Ban jusqu'à</label><span class="value">${bannedUntil?formatTs(bannedUntil):'—'}</span></div>
						</div>
						${buildReputationPanel(reputation)}
						${forced?'<div class="restriction-item" style="margin-top:12px;">Modération requise (forcée)</div>':''}
						${showAdminPanel?`<div class="admin-actions-wrapper" style="display:block;">
							<div class="admin-actions-card">
								<h3><span class="material-icons" style="font-size:22px;color:#bb86fc;">admin_panel_settings</span> Actions administrateur <span class="admin-badge">ADMIN</span></h3>
														<div class="quick-actions-category-label">Historique actions</div>
								${buildQuickActions(userId,reputation,targetIsAdmin)}
								<div class="quick-actions-category-label" style="margin-top:22px;">Actions avancées</div>
								<div class="advanced-actions-row">
									<button class="advanced-btn" data-adv-action="adjust-score" data-user="${userId}"><span class="material-icons">tune</span>Ajuster le score</button>
									<button class="advanced-btn" data-adv-action="manage-restrictions" data-user="${userId}"><span class="material-icons">settings</span>Gérer les restrictions</button>
								</div>
							</div>
						</div>`:''}
					</div>
					<div class="tab-panel" data-panel="restrictions">${restrictionsList(reputation)}</div>
					<div class="tab-panel" data-panel="activity">
						<div class="activity-stats-grid">
							<div class="activity-stat-card recent"><div class="icon"><span class="material-icons">history</span></div><div class="value">${activityCount}</div><div class="label">Actions récentes</div></div>
							<div class="activity-stat-card last"><div class="icon"><span class="material-icons">schedule</span></div><div class="value">${lastActivityLabel}</div><div class="label">Dernière activité</div></div>
						</div>
						${buildActivities(recentActions)}
					</div>
					<div class="tab-panel" data-panel="admin">${buildAdminHistory(adminActions,adminNotes)}</div>
				</div>
			</div>
		</div>`;
		modal.addEventListener('click', e=>{ if(e.target===modal || e.target.hasAttribute('data-close-profile')) modal.remove(); });
		modal.addEventListener('click', e=>{
			const tabBtn = e.target.closest('.tab-btn'); if(tabBtn){
				const tab = tabBtn.getAttribute('data-tab');
				modal.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b===tabBtn));
				modal.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active', p.getAttribute('data-panel')===tab));
			}
		});
			// Make modal visible using existing modal styles
			modal.classList.add('active');
			modal.style.display = 'flex';
			document.body.appendChild(modal);

			// Attach local handlers for advanced actions to ensure they open even if global delegation misses
			try{
				modal.querySelectorAll('[data-adv-action]').forEach(btn=>{
					btn.addEventListener('click', ev=>{
						ev.stopPropagation();
						const action = btn.getAttribute('data-adv-action');
						const uid = btn.getAttribute('data-user');
						if(action==='adjust-score') openAdjustScoreModal(uid);
						if(action==='manage-restrictions') openRestrictionsModal(uid);
					});
				});
				modal.querySelectorAll('[data-profile-action]').forEach(btn=>{
					btn.addEventListener('click', ev=>{
						ev.stopPropagation();
						// call the centralized handler to reuse logic
						handleModerationAction({target:btn, stopPropagation:()=>{}});
					});
				});
			}catch(_){ /* ignore attach errors */ }
	}

	async function handleModerationAction(e){
		// Advanced admin actions (score adjust / restrictions)
		const advBtn = e.target.closest('[data-adv-action]');
		if(advBtn){
			const action = advBtn.getAttribute('data-adv-action');
			const userId = advBtn.getAttribute('data-user');
			if(action==='adjust-score') return openAdjustScoreModal(userId);
			if(action==='manage-restrictions') return openRestrictionsModal(userId);
		}
		const btn = e.target.closest('[data-profile-action]');
		if(!btn) return;
		const action = btn.getAttribute('data-profile-action');
		const userId = btn.getAttribute('data-user');

		// Helper: run the actual admin call either via MUSO.executeWhenReady (queue) or immediately
		const runOrQueue = (fn)=>{
			// Return a Promise that resolves when fn finishes. If services are ready, run immediately and await.
			if(window.MUSO && window.MUSO.servicesReady){
				try { return Promise.resolve().then(()=>fn()); } catch(err){ return Promise.reject(err); }
			}

			// If MUSO exists but not ready, push a wrapper to pendingActions that resolves when fn completes.
			if(window.MUSO){
				return new Promise((resolve,reject)=>{
					const wrapper = async ()=>{
						try{ const r = await fn(); resolve(r); } catch(e){ reject(e); }
					};
					// Push wrapper to the pending queue so executeWhenReady will run it later
					window.MUSO.pendingActions = window.MUSO.pendingActions || [];
					window.MUSO.pendingActions.push(wrapper);
				});
			}

			// If MUSO not present, just run immediately
			try { return Promise.resolve().then(()=>fn()); } catch(err){ return Promise.reject(err); }
		};

		// Small toast helper for feedback
		function showToast(message, type='info'){ // type: info|success|error
			const id = 'muso-toast';
			let el = document.getElementById(id);
			if(!el){ el = document.createElement('div'); el.id = id; el.className='muso-toast'; document.body.appendChild(el); }
			el.textContent = message;
			el.className = 'muso-toast ' + type;
			el.style.opacity = '1';
			clearTimeout(el._t);
			el._t = setTimeout(()=>{ el.style.opacity='0'; }, 3500);
		}

		// Ensure AdminActionsService is loaded before calling it
		function ensureAdminLoaded(timeoutMs=5000){
			if(window.AdminActionsService) return Promise.resolve();
			return new Promise((resolve,reject)=>{
				const start = Date.now();
				const iv = setInterval(()=>{
					if(window.AdminActionsService){ clearInterval(iv); resolve(); }
					else if(Date.now()-start>timeoutMs){ clearInterval(iv); reject(new Error('AdminActionsService not available')); }
				}, 80);
			});
		}

		// Call an admin action using the AdminActionsService when available,
		// otherwise perform a client-side Firestore fallback and log an admin_actions entry.
		async function callAdminAction(method, payload={}){
			try{
				if(window.AdminActionsService && typeof window.AdminActionsService[method] === 'function'){
					return await window.AdminActionsService[method](payload);
				}
				// Fallback: attempt to perform minimal changes directly in Firestore and write an admin_actions log
				const firestore = firebase.firestore();
				const adminId = (firebase.auth().currentUser||{}).uid || null;
				const userId = payload.userId || payload.targetId || null;
				const actionDoc = {
					targetId: userId,
					userId: userId,
					adminId,
					actionType: method,
					payload: payload,
					reason: payload.reason || payload.note || null,
					timestamp: firebase.firestore.FieldValue.serverTimestamp()
				};
				// Best-effort state updates for common methods
				if(method === 'quarantineUser'){
					await firestore.collection('user_reputation').doc(userId).set({restrictions:{quarantine:true}}, {merge:true});
				} else if(method === 'unquarantineUser'){
					await firestore.collection('user_reputation').doc(userId).set({restrictions:{quarantine:false}}, {merge:true});
				} else if(method === 'banUser'){
					const hours = payload.hours||0; const bannedUntil = Date.now() + (hours*3600*1000);
					await firestore.collection('user_reputation').doc(userId).set({restrictions:{isBanned:true, bannedUntil:new Date(bannedUntil)}},{merge:true});
				} else if(method === 'unbanUser'){
					await firestore.collection('user_reputation').doc(userId).set({restrictions:{isBanned:false}},{merge:true});
				} else if(method === 'blockUserReports'){
					await firestore.collection('user_reputation').doc(userId).set({restrictions:{canReport:false}},{merge:true});
				} else if(method === 'unblockUserReports'){
					await firestore.collection('user_reputation').doc(userId).set({restrictions:{canReport:true}},{merge:true});
				} else if(method === 'blockUserVotes'){
					await firestore.collection('user_reputation').doc(userId).set({restrictions:{canVote:false}},{merge:true});
				} else if(method === 'unblockUserVotes'){
					await firestore.collection('user_reputation').doc(userId).set({restrictions:{canVote:true}},{merge:true});
				} else if(method === 'resetUserReputation'){
					await firestore.collection('user_reputation').doc(userId).set({reputationScore:100, restrictions:{}},{merge:true});
				} else if(method === 'addAdminNote'){
					await firestore.collection('admin_notes').add({userId:userId, note: payload.note || payload.reason || '', category: payload.category || 'note', adminId, timestamp: firebase.firestore.FieldValue.serverTimestamp()});
				} else if(method === 'adjustUserScore'){
					const delta = payload.scoreChange || 0;
					const repRef = firestore.collection('user_reputation').doc(userId);
					await firestore.runTransaction(async (t)=>{
						const doc = await t.get(repRef);
						const current = (doc.exists && (doc.data().reputationScore ?? doc.data().score ?? doc.data().points)) || 0;
						const newScore = Math.max(0, Math.min(200, current + delta));
						t.set(repRef, {reputationScore:newScore}, {merge:true});
					});
				}
				// Log the admin action
				try{ await firestore.collection('admin_actions').add(actionDoc); } catch(_){ /* best-effort */ }
				console.warn('[AdminAction fallback] used client-side fallback for', method, userId);
				return {fallback:true};
			} catch(err){ console.error('callAdminAction error', err); throw err; }
		}

		// Reusable styled action dialog (title, icon HTML, colorClass or color string, description, confirmLabel, onConfirm(reason))
		function openStyledActionDialog({title, iconHtml='', color='', description='', confirmLabel='Confirmer', confirmClass='btn-primary', textareaPlaceholder='Raison (obligatoire)', onConfirm}){
			return new Promise((resolve,reject)=>{
				const modal = document.createElement('div'); modal.className='modal';
				const colorStyle = color && color.startsWith('#')?(`border-color:${color};box-shadow:0 0 0 4px ${color}22;`):'';
				modal.innerHTML = `<div class="action-modal" style="max-width:520px;">
					<div class="modal-header"><h2>${iconHtml} ${title}</h2><button class="close-btn" data-close-modal>&times;</button></div>
					<div class="modal-body">
						<div class="action-desc" style="${colorStyle} padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.06); margin-bottom:14px; background: rgba(0,0,0,0.35);">${description}</div>
						<textarea class="action-reason" placeholder="${textareaPlaceholder}" style="width:100%; min-height:84px; padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:inherit;"></textarea>
						<div class="action-footer" style="display:flex; align-items:center; justify-content:space-between; margin-top:14px;">
							<button class="btn-text" data-close-modal>Annuler</button>
							<button class="${confirmClass}" data-confirm disabled>${confirmLabel}</button>
						</div>
					</div>
				</div>`;
				modal.addEventListener('click', ev=>{ if(ev.target===modal || ev.target.hasAttribute('data-close-modal')) { modal.remove(); reject(new Error('closed')); } });
				const textarea = modal.querySelector('.action-reason');
				const confirmBtn = modal.querySelector('[data-confirm]');
				textarea.addEventListener('input', ()=>{ confirmBtn.disabled = textarea.value.trim().length<3; });
				confirmBtn.addEventListener('click', async ()=>{
					const reason = textarea.value.trim();
					try{
						// Wait for admin service to be available
						await ensureAdminLoaded().catch(()=>{});
						// call user provided handler; allow handler to use runOrQueue
						await onConfirm(reason);
						// show success toast and close
						showToast('Action effectuée', 'success');
						modal.remove(); resolve(true);
					}catch(err){ console.error('Erreur action modal', err); showToast(err.message||'Erreur', 'error'); }
				});
				// show modal
				modal.classList.add('active');
				modal.style.display = 'flex';
				document.body.appendChild(modal);
			});
		}

		// Gather confirmations / reasons synchronously so the user gets immediate feedback
		try {
		// Map actions to styled dialogs
		if(action===ACTIONS.QUARANTINE){
			await openStyledActionDialog({
				title: 'Mettre en quarantaine',
				iconHtml: '<span class="material-icons" style="color:orange;">security</span>',
				color: '#ff9800',
				description: 'L\'utilisateur sera mis en quarantaine (niveau 3 anti multi-comptes) et perdra 25 points de réputation.',
				confirmLabel: 'Confirmer',
					onConfirm: async (reason)=>{ await runOrQueue(async ()=>{ await callAdminAction('quarantineUser', {userId, reason}); }); }
			});
		} else if(action===ACTIONS.UNQUARANTINE){
			await openStyledActionDialog({
				title: 'Débannir l\'utilisateur',
				iconHtml: '<span class="material-icons" style="color:green;">lock_open</span>',
				color: '#4caf50',
				description: 'L\'utilisateur retrouvera immédiatement ses droits d\'actions.',
				confirmLabel: 'Confirmer',
					onConfirm: async (reason)=>{ await runOrQueue(async ()=>{ await callAdminAction('unquarantineUser', {userId, reason}); }); }
			});
		} else if([ACTIONS.BAN_24,ACTIONS.BAN_7,ACTIONS.BAN_PERM].includes(action)){
			const hours = action===ACTIONS.BAN_24?24: action===ACTIONS.BAN_7?24*7:24*365*10;
			const durationText = hours>=24*365? 'permanent' : (hours>=24? `${hours/24} jour(s)` : `${hours} heure(s)`);
			const desc = (action===ACTIONS.BAN_PERM)?
				'⚠️ ACTION IRRÉVERSIBLE ⚠️\nLe bannissement permanent ne peut pas être annulé automatiquement. L\'utilisateur ne pourra plus effectuer aucune action sur la plateforme.' :
				`L\'utilisateur sera banni pendant ${durationText} et ne pourra plus effectuer d\'actions.`;
			await openStyledActionDialog({
				title: action===ACTIONS.BAN_PERM? 'Bannissement permanent' : `Bannir l\'utilisateur`,
				iconHtml: `<span class="material-icons" style="color:red;">block</span>`,
				color: '#e53935',
				description: desc,
				confirmLabel: action===ACTIONS.BAN_PERM? 'BANNIR DÉFINITIVEMENT' : 'Confirmer',
				confirmClass: action===ACTIONS.BAN_PERM? 'btn-danger':'btn-primary',
					onConfirm: async (reason)=>{ await runOrQueue(async ()=>{ await callAdminAction('banUser', {userId, hours, reason}); }); }
			});
		} else if(action===ACTIONS.UNBAN){
			await openStyledActionDialog({
				title: 'Débannir l\'utilisateur',
				iconHtml: '<span class="material-icons" style="color:green;">lock_open</span>',
				color: '#4caf50',
				description: 'L\'utilisateur retrouvera immédiatement ses droits d\'actions.',
				confirmLabel: 'Confirmer',
					onConfirm: async (reason)=>{ await runOrQueue(async ()=>{ await callAdminAction('unbanUser', {userId, reason}); }); }
			});
		} else if(action===ACTIONS.BLOCK_REPORTS){
			await openStyledActionDialog({
				title: 'Bloquer signalements',
				iconHtml: '<span class="material-icons" style="color:orange">report_off</span>',
				color: '#ff9800',
				description: 'Empêche la création de nouveaux signalements.',
				confirmLabel: 'Confirmer',
					onConfirm: async (reason)=>{ await runOrQueue(async ()=>{ await callAdminAction('blockUserReports', {userId, reason}); }); }
			});
		} else if(action===ACTIONS.UNBLOCK_REPORTS){
			await openStyledActionDialog({
				title: 'Débloquer signalements',
				iconHtml: '<span class="material-icons" style="color:green">report</span>',
				color: '#4caf50',
				description: 'Réautorise l\'utilisateur à créer des signalements.',
				confirmLabel: 'Confirmer',
					onConfirm: async (reason)=>{ await runOrQueue(async ()=>{ await callAdminAction('unblockUserReports', {userId, reason}); }); }
			});
		} else if(action===ACTIONS.BLOCK_VOTES){
			await openStyledActionDialog({
				title: 'Bloquer votes',
				iconHtml: '<span class="material-icons" style="color:#1976d2">how_to_vote</span>',
				color: '#1976d2',
				description: 'Empêche de voter sur les signalements.',
				confirmLabel: 'Confirmer',
					onConfirm: async (reason)=>{ await runOrQueue(async ()=>{ await callAdminAction('blockUserVotes', {userId, reason}); }); }
			});
		} else if(action===ACTIONS.UNBLOCK_VOTES){
			await openStyledActionDialog({
				title: 'Débloquer votes',
				iconHtml: '<span class="material-icons" style="color:green">how_to_vote</span>',
				color: '#4caf50',
				description: 'Réautorise l\'utilisateur à voter sur les signalements.',
				confirmLabel: 'Confirmer',
					onConfirm: async (reason)=>{ await runOrQueue(async ()=>{ await callAdminAction('unblockUserVotes', {userId, reason}); }); }
			});
		} else if(action===ACTIONS.RESET_REP){
			await openStyledActionDialog({
				title: 'Reset réputation',
				iconHtml: '<span class="material-icons" style="color:blue">refresh</span>',
				color: '#2196f3',
				description: 'La réputation sera remise à 100 points avec toutes les restrictions levées. Cette action est réversible.',
				confirmLabel: 'Confirmer',
					onConfirm: async (reason)=>{ await runOrQueue(async ()=>{ await callAdminAction('resetUserReputation', {userId, reason}); }); }
			});
		} else if(action===ACTIONS.ADD_NOTE){
			await openStyledActionDialog({
				title: 'Ajouter une note',
				iconHtml: '<span class="material-icons" style="color:teal">note_add</span>',
				color: '#009688',
				description: 'Ajouter une note administrative pour ce compte.',
				confirmLabel: 'Ajouter',
					onConfirm: async (reason)=>{ await runOrQueue(async ()=>{ await callAdminAction('addAdminNote', {userId, note: reason, category:'note'}); }); }
			});
		} else if(action==='revoke'){
			// Revoke admin rights - ask reason then perform immediate update
			await openStyledActionDialog({
				title: 'Révoquer admin',
				iconHtml: '<span class="material-icons" style="color:purple">admin_panel_settings</span>',
				color: '#7e57c2',
				description: 'Révoquer les droits administrateur pour cet utilisateur.',
				confirmLabel: 'Révoquer',
				onConfirm: async (reason)=>{
					try {
						await firebase.firestore().collection('users').doc(userId).update({isAdmin:false, adminRevokedAt: firebase.firestore.FieldValue.serverTimestamp()});
						await firebase.firestore().collection('admin_actions').add({userId, adminId:(firebase.auth().currentUser||{}).uid, actionType:'revokeAdmin', reason:reason||'Révocation', timestamp: firebase.firestore.FieldValue.serverTimestamp()});
					} catch(err){ console.error('Erreur révoquer admin', err); alert(err.message||'Erreur révoquer admin'); }
				}
			});
		}

		// Refresh modal/UI
		document.querySelectorAll('.modal').forEach(m=>m.remove());
		cache.delete(userId);
		openProfileModal(userId,{showModerationButtons:true});
	} catch(err){ console.error('❌ Action admin échouée', err); /* user already sees errors in modal handlers */ }
	}
	document.addEventListener('click', handleModerationAction);



	function closeAllProfileModals(){
		document.querySelectorAll('.modal').forEach(m=>{
			if(m.querySelector('.profile-modal')) m.remove();
		});
	}
	window.closeAllProfileModals = closeAllProfileModals;

	document.addEventListener('keydown', e=>{
		if(e.key==='Escape') closeAllProfileModals();
	});

	async function openProfileModal(userId, options={}){
		try { const data = await fetchUser(userId); await buildModal(data, options);} catch(e){ console.error('❌ Profil introuvable', e); alert(e.message||'Profil introuvable'); }
	}
	window.openProfileModal = openProfileModal;

	// ===== Modales avancées =====
	async function openAdjustScoreModal(userId){
		let repDoc; try { repDoc = await firebase.firestore().collection('user_reputation').doc(userId).get(); } catch(e){}
		const current = repDoc?.data()?.reputationScore ?? 0;
		// Build styled adjust-score modal using the new action dialog UI
		const modal = document.createElement('div'); modal.className='modal';
		modal.innerHTML = `<div class="action-modal">
			<div class="modal-header"><h2><span class="material-icons" style="color:#2196f3">tune</span> Ajuster le score</h2><button class="close-btn" data-close-modal>&times;</button></div>
			<div class="modal-body">
				<div class="adjust-current">Score actuel: <strong>${current}</strong></div>
				<div class="choice-grid">
					<button class="choice-chip" data-delta="-50">-50</button>
					<button class="choice-chip" data-delta="-25">-25</button>
					<button class="choice-chip" data-delta="-10">-10</button>
					<button class="choice-chip" data-delta="10">+10</button>
					<button class="choice-chip" data-delta="25">+25</button>
					<button class="choice-chip" data-delta="50">+50</button>
				</div>
				<div class="new-score" style="display:none">Nouveau score: <span class="new-score-value"></span></div>
				<textarea class="action-reason" placeholder="Raison (obligatoire)"></textarea>
				<div class="action-footer"><button class="btn-text" data-close-modal>Annuler</button><button class="btn-primary" data-apply disabled>Appliquer</button></div>
			</div>
		</div>`;
		modal.addEventListener('click', ev=>{ if(ev.target===modal || ev.target.hasAttribute('data-close-modal')) modal.remove(); });
		const chips = modal.querySelectorAll('.choice-chip');
		const reasonEl = modal.querySelector('.action-reason');
		const applyBtn = modal.querySelector('[data-apply]');
		const newScoreEl = modal.querySelector('.new-score');
		const newScoreValue = modal.querySelector('.new-score-value');
		let selectedDelta = 0;
		chips.forEach(c=>c.addEventListener('click', ()=>{
			chips.forEach(x=>x.classList.remove('selected'));
			c.classList.add('selected');
			selectedDelta = parseInt(c.getAttribute('data-delta'),10)||0;
			const newScore = Math.max(0, Math.min(200, current + selectedDelta));
			newScoreValue.textContent = String(newScore);
			newScoreEl.style.display = 'block';
			checkValidity();
		}));
		reasonEl.addEventListener('input', checkValidity);
		function checkValidity(){ applyBtn.disabled = !(selectedDelta !== 0 && reasonEl.value.trim().length>2); }
		applyBtn.addEventListener('click', async ()=>{
			const delta = selectedDelta; const reason = reasonEl.value.trim();
			try{
				// Run the admin call via runOrQueue so it works even if MUSO/Services are not ready yet
				await runOrQueue(async ()=>{
					await ensureAdminLoaded().catch(()=>{});
					return callAdminAction('adjustUserScore', {userId, scoreChange: delta, reason});
				});
				modal.remove(); cache.delete(userId); openProfileModal(userId,{showModerationButtons:true});
			}catch(err){ console.error('Erreur ajustement score', err); alert(err.message||'Erreur ajustement score'); }
		});
		document.body.appendChild(modal);
	}

	async function openRestrictionsModal(userId){
		// show modal immediately; action calls are queued when services become ready
		let repData={}; try { const doc=await firebase.firestore().collection('user_reputation').doc(userId).get(); if(doc.exists) repData=doc.data(); } catch(e){}
		const r = repData.restrictions||{};
		const modal = document.createElement('div'); modal.className='modal';
		modal.innerHTML = `<div class="restrictions-modal">
			<h2 style="margin:0; display:flex; gap:10px; align-items:center; font-size:22px;"><span class="material-icons" style="color:#bb86fc;">settings</span>Gérer restrictions</h2>
			<div class="restrictions-group">
				<div class="restriction-toggle-card" data-key="canReport">
					<div class="restriction-toggle-info"><strong>Bloquer signalements</strong><span>Empêche la création de nouveaux signalements</span></div>
					<label class="switch"><input type="checkbox" ${r.canReport===false?'':'checked'}><span class="slider round"></span></label>
				</div>
				<div class="restriction-toggle-card" data-key="canVote">
					<div class="restriction-toggle-info"><strong>Bloquer votes</strong><span>Empêche de voter sur les signalements</span></div>
					<label class="switch"><input type="checkbox" ${r.canVote===false?'':'checked'}><span class="slider round"></span></label>
				</div>
				<div class="restriction-toggle-card" data-key="reviewPending">
					<div class="restriction-toggle-info"><strong>Forcer modération</strong><span>Chaque action nécessitera un examen</span></div>
					<label class="switch"><input type="checkbox" ${r.reviewPending===true||r.forceModeration===true?'checked':''}><span class="slider round"></span></label>
				</div>
			</div>
			<div class="restrictions-footer"><button class="btn-text" data-close-modal>Fermer</button></div>
		</div>`;
		modal.addEventListener('click', ev=>{ if(ev.target===modal || ev.target.hasAttribute('data-close-modal')) modal.remove(); });
		modal.querySelectorAll('.restriction-toggle-card input').forEach(input=>{
			input.addEventListener('change', async ()=>{
				const card = input.closest('.restriction-toggle-card'); const key=card.dataset.key; const value=input.checked;
				// disable input while working
				input.disabled = true;
				try{
					await runOrQueue(async ()=>{
						await ensureAdminLoaded().catch(()=>{});
						if(key==='canReport'){
							await callAdminAction(value? 'unblockUserReports' : 'blockUserReports', {userId, reason:'Toggle depuis restrictions'});
							showToast(value? 'Signalements débloqués' : 'Signalements bloqués', 'success');
						} else if(key==='canVote') {
							await callAdminAction(value? 'unblockUserVotes' : 'blockUserVotes', {userId, reason:'Toggle depuis restrictions'});
							showToast(value? 'Votes débloqués' : 'Votes bloqués', 'success');
						} else if(key==='reviewPending') {
							// use Firestore set for reviewPending because AdminActionsService may not expose a toggle for it
							await firebase.firestore().collection('user_reputation').doc(userId).set({'restrictions.reviewPending': value},{merge:true});
							await firebase.firestore().collection('admin_actions').add({userId, adminId:(firebase.auth().currentUser||{}).uid, actionType:'toggleModeration', reason: value?'Forcer modération':'Retirer modération', metadata:{reviewPending:value}, timestamp: firebase.firestore.FieldValue.serverTimestamp()});
							showToast(value? 'Modération forcée activée' : 'Modération forcée désactivée', 'success');
						}
						cache.delete(userId);
					});
					// refresh profile modal
					document.querySelectorAll('.modal').forEach(m=>m.remove());
					openProfileModal(userId,{showModerationButtons:true});
				}catch(err){
					console.error('Erreur mise à jour restriction', err);
					showToast('Erreur: ' + (err.message||err), 'error');
					// revert checkbox to previous state on error
					input.checked = !value;
				} finally {
					input.disabled = false;
				}
			});
		});
		document.body.appendChild(modal);
	}
})();
