// Vue des comptes suspects
let allAccounts = [];
let filteredAccounts = [];
let currentPage = 0;
const accountsPerPage = 20;
let currentLevelFilter = 0;
let currentAccount = null;

document.addEventListener('DOMContentLoaded', () => {
  console.log('📊 Initialisation vue Comptes suspects');
  loadSuspiciousAccounts();
});

function goBack() {
  window.location.href = '../index.html';
}

async function loadSuspiciousAccounts() {
  const spinner = document.getElementById('loading-spinner');
  const accountsList = document.getElementById('accounts-list');
  const emptyState = document.getElementById('empty-state');
  // Inject container résumé s'il n'existe pas
  if(!document.getElementById('suspicious-summary') && accountsList){
    const summary = document.createElement('div');
    summary.id='suspicious-summary';
    summary.className='suspicious-summary';
    accountsList.parentElement?.insertBefore(summary, accountsList);
  }
  
  spinner.style.display = 'flex';
  accountsList.style.display = 'none';
  emptyState.style.display = 'none';
  
  try {
    console.log('🔍 Chargement comptes suspects...');
    
    const snapshot = await FirebaseServices.firestore
      .collection('suspicious_accounts')
      .get();
    
    // Construire liste IDs et récupérer noms utilisateurs
    const userIds = snapshot.docs.map(d => d.id);
    const userDocs = await Promise.all(userIds.map(async (uid) => {
      try {
        const u = await FirebaseServices.firestore.collection('users').doc(uid).get();
        return { id: uid, data: u.exists ? u.data() : null };
      } catch (e) {
        console.warn('⚠️ Impossible de récupérer user', uid, e); return { id: uid, data: null }; }
    }));
    const userMap = new Map(userDocs.map(u => [u.id, u.data]));
    
    allAccounts = snapshot.docs.map(doc => {
      const raw = doc.data();
      const userData = userMap.get(doc.id) || {};
      return {
        id: doc.id,
        userId: doc.id,
        displayName: userData.username || userData.displayName || null,
        profilePicture: userData.profilePicture || null,
        ...raw,
        detectedAt: raw.detectedAt?.toDate()
      };
    });
    
    console.log(`✅ ${allAccounts.length} comptes suspects chargés`);
    
    applyFilters();
    updateCounts();
    renderAccounts();
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    allAccounts = [];
    filteredAccounts = [];
  } finally {
    spinner.style.display = 'none';
  }
}

function applyFilters() {
  const searchQuery = document.getElementById('search-input').value.toLowerCase();
  filteredAccounts = allAccounts.filter(account => {
    if (searchQuery) {
      // Recherche par ID (exigé) + bonus: nom
      const userId = (account.userId || '').toLowerCase();
      const name = (account.displayName || '').toLowerCase();
      if (!userId.includes(searchQuery) && !name.includes(searchQuery)) return false;
    }
    if (currentLevelFilter > 0 && account.suspicionLevel !== currentLevelFilter) return false;
    return true;
  });
  
  filteredAccounts.sort((a, b) => {
    if (!a.detectedAt || !b.detectedAt) return 0;
    return b.detectedAt - a.detectedAt;
  });
  
  currentPage = 0;
  renderAccounts();
  updateStats();
}

function setLevelFilter(level) {
  currentLevelFilter = level;
  
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
    if (parseInt(btn.dataset.level) === level) {
      btn.classList.add('active');
    }
  });
  
  applyFilters();
}

function updateCounts() {
  const counts = {
    all: allAccounts.length,
    level1: allAccounts.filter(a => a.suspicionLevel === 1).length,
    level2: allAccounts.filter(a => a.suspicionLevel === 2).length,
    level3: allAccounts.filter(a => a.suspicionLevel === 3).length,
    level4: allAccounts.filter(a => a.suspicionLevel === 4).length,
    level5: allAccounts.filter(a => a.suspicionLevel === 5).length
  };
  
  document.getElementById('count-all').textContent = counts.all;
  document.getElementById('count-level-1').textContent = counts.level1;
  document.getElementById('count-level-2').textContent = counts.level2;
  document.getElementById('count-level-3').textContent = counts.level3;
  document.getElementById('count-level-4').textContent = counts.level4;
  document.getElementById('count-level-5').textContent = counts.level5;
  document.getElementById('total-accounts').textContent = counts.all;

  // Mettre à jour résumé graphique
  const summary = document.getElementById('suspicious-summary');
  if(summary){
    summary.innerHTML = `
      <div class="sus-chip level-5"><span class="count">${counts.level5}</span> Niv 5</div>
      <div class="sus-chip level-4"><span class="count">${counts.level4}</span> Niv 4</div>
      <div class="sus-chip level-3"><span class="count">${counts.level3}</span> Niv 3</div>
      <div class="sus-chip level-2"><span class="count">${counts.level2}</span> Niv 2</div>
      <div class="sus-chip level-1"><span class="count">${counts.level1}</span> Niv 1</div>
      <div class="sus-chip" style="border-color:#6ec6ff;"><span class="count">${counts.all}</span> Total</div>`;
  }
}

function updateStats() {
  document.getElementById('filtered-accounts').textContent = filteredAccounts.length;
  
  const totalPages = Math.ceil(filteredAccounts.length / accountsPerPage);
  const currentPageNum = currentPage + 1;
  
  document.getElementById('current-page-info').textContent = `${currentPageNum}/${totalPages || 1}`;
  document.getElementById('pagination-info').textContent = `Page ${currentPageNum} / ${totalPages || 1}`;
  
  document.getElementById('prev-page').disabled = currentPage === 0;
  document.getElementById('next-page').disabled = currentPage >= totalPages - 1 || totalPages === 0;
}

function renderAccounts() {
  const accountsList = document.getElementById('accounts-list');
  const emptyState = document.getElementById('empty-state');
  
  if (filteredAccounts.length === 0) {
    accountsList.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }
  
  accountsList.style.display = 'flex';
  emptyState.style.display = 'none';
  
  const start = currentPage * accountsPerPage;
  const end = start + accountsPerPage;
  const pageAccounts = filteredAccounts.slice(start, end);
  
  accountsList.innerHTML = pageAccounts.map(account => createAccountCard(account)).join('');
  updateStats();
}

function createAccountCard(account) {
  const level = account.suspicionLevel || 1;
  const suspicionClass = level >=5 ? 'suspicious-high' : level >=3 ? 'suspicious-medium' : 'suspicious-low';
  const reasonsArr = (account.reasons || []);
  const reasons = reasonsArr.join(', ');
  const relatedCount = (account.relatedAccounts || []).length;
  const timestamp = formatDate(account.detectedAt);
  return `
  <div class="suspicious-card level-${level}">
    <div class="lvl-circle lvl-${level}">L${level}</div>
    <div class="sc-header">
      <div class="sc-avatar">${account.profilePicture ? `<img src="${account.profilePicture}" alt="${account.displayName || 'Utilisateur'}">` : `<span class="material-icons search-btn" data-userid="${account.userId}" style="font-size:26px;opacity:.6;">person_search</span>`}</div>
      <div class="sc-main">
        <div class="sc-name">${account.displayName || 'Utilisateur'} </div>
        <div class="sc-id" style="opacity:.7;font-family:monospace;">${account.userId.substring(0,18)}${account.userId.length>18?'…':''}</div>
        <div class="sc-meta">
          <span class="level-badge level-${level} ${suspicionClass}">Niveau ${level}</span>
          ${relatedCount>0 ? `<span class="rel-badge">${relatedCount} compte${relatedCount>1?'s':''} liés</span>`:''}
          <span class="detected-time">${timestamp}</span>
        </div>
      </div>
      <div class="sc-open"><span class="material-icons">chevron_right</span></div>
    </div>
    <div class="sc-reasons">
      ${reasonsArr.length? reasonsArr.map(r=>`<div class="reason-row"><span class="material-icons warn">warning_amber</span><span>${r}</span></div>`).join('') : '<div class="reason-row empty"><span class="material-icons" style="opacity:.4;">info</span><span>Aucune raison spécifiée</span></div>'}
    </div>
  </div>`;
}

function formatDate(date) {
  if (!date) return 'date inconnue';
  
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'à l\'instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  if (hours < 24) return `il y a ${hours}h`;
  if (days < 7) return `il y a ${days}j`;
  
  return date.toLocaleDateString('fr-FR');
}

function previousPage() {
  if (currentPage > 0) {
    currentPage--;
    renderAccounts();
  }
}

function nextPage() {
  const totalPages = Math.ceil(filteredAccounts.length / accountsPerPage);
  if (currentPage < totalPages - 1) {
    currentPage++;
    renderAccounts();
  }
}

// (showAccountDetails replaced by direct openProfileModal on card click)

function closeModal() {
  document.getElementById('account-modal').style.display = 'none';
  currentAccount = null;
}

function viewUserProfile() {
  if (!currentAccount) return;
  openProfileModal(currentAccount.userId, { showModerationButtons: true });
}

async function banAccount() {
  if (!currentAccount) return;
  
  if (!confirm(`Voulez-vous vraiment bannir ce compte ?\n\nUtilisateur: ${currentAccount.userId}\nNiveau suspicion: ${currentAccount.suspicionLevel}`)) {
    return;
  }
  
  try {
    // TODO: Implémenter action de bannissement
    console.log('🚫 Bannissement:', currentAccount.userId);
    alert('Fonctionnalité à venir: Bannissement');
    closeModal();
  } catch (error) {
    console.error('❌ Erreur:', error);
    alert('Erreur lors du bannissement');
  }
}

document.addEventListener('click', (e) => {
  const modal = document.getElementById('account-modal');
  if (e.target === modal) closeModal();
});

// Delegated click: only the person_search icon opens the profile modal now
document.addEventListener('click', (e) => {
  const el = e.target.closest && e.target.closest('.search-btn');
  if (!el) return;
  const uid = el.dataset.userid;
  if (uid) {
    openProfileModal(uid, { showModerationButtons: true });
  }
});
