// Blocked Accounts View Logic
let allBlockedAccounts = [];
let filteredBlockedAccounts = [];
let currentPage = 1;
const itemsPerPage = 20;
let selectedAccount = null;

// Load blocked accounts from Firebase
async function loadBlockedAccounts() {
    console.log('🔍 Loading blocked accounts...');
    const loadingSpinner = document.getElementById('loading-spinner');
    const blockedList = document.getElementById('blocked-list');
    const emptyState = document.getElementById('empty-state');
    
    loadingSpinner.style.display = 'block';
    blockedList.style.display = 'none';
    emptyState.style.display = 'none';
    
    try {
        const db = firebase.firestore();
        // Load all user_reputation docs and compute which ones have restrictions
        // Previously we filtered only where restrictions.canReport == false which omitted other restriction types
        const snapshot = await db.collection('user_reputation').get();
        
        console.log(`✅ Found ${snapshot.size} blocked accounts`);
        
        allBlockedAccounts = [];
                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    // Only consider documents that have meaningful restriction flags
                    const r = data.restrictions || {};
                    const hasRestriction = r.isBanned === true || r.canReport === false || r.canVote === false || r.reviewPending === true || r.underReview === true || r.canPost === false || r.canComment === false;
                    if (!hasRestriction) {
                        // skip documents without restriction-related fields
                        continue;
                    }
            
            // Get additional user details
            let userDetails = null;
            try {
                const userDoc = await db.collection('users').doc(doc.id).get();
                if (userDoc.exists) {
                    userDetails = userDoc.data();
                }
            } catch (error) {
                console.log('❌ Error fetching user details:', error);
            }
            
            allBlockedAccounts.push({
                userId: doc.id,
                restrictions: data.restrictions || {},
                reputationScore: data.reputationScore || 0,
                lastUpdated: data.lastUpdated?.toDate() || new Date(),
                blockReason: data.restrictions?.reason || 'Non spécifié',
                blockedAt: data.restrictions?.blockedAt?.toDate() || data.lastUpdated?.toDate() || new Date(),
                // User details
                username: userDetails?.username || 'Utilisateur inconnu',
                email: userDetails?.email || 'N/A',
                profilePicture: userDetails?.profilePicture || null,
                totalReports: data.totalReports || 0,
                violationCount: data.violationCount || 0
            });
        }
        
                console.log(`✅ Loaded ${allBlockedAccounts.length} blocked accounts with details (after filtering restrictions)`);
        filteredBlockedAccounts = [...allBlockedAccounts];
                // Fallback: if no restricted documents were found but snapshot had docs,
                // include any documents that have a 'restrictions' object to avoid showing zeros
                if (allBlockedAccounts.length === 0 && snapshot.size > 0) {
                    console.warn('[BlockedAccounts] No docs matched restriction flags; falling back to any doc with a restrictions object');
                    for (const doc of snapshot.docs) {
                        const data = doc.data();
                        if (data.restrictions) {
                            let userDetails = null;
                            try {
                                const userDoc = await db.collection('users').doc(doc.id).get();
                                if (userDoc.exists) userDetails = userDoc.data();
                            } catch (e) { /* ignore */ }
                            allBlockedAccounts.push({
                                userId: doc.id,
                                restrictions: data.restrictions || {},
                                reputationScore: data.reputationScore || 0,
                                lastUpdated: data.lastUpdated?.toDate() || new Date(),
                                blockReason: data.restrictions?.reason || 'Non spécifié',
                                blockedAt: data.restrictions?.blockedAt?.toDate() || data.lastUpdated?.toDate() || new Date(),
                                username: userDetails?.username || 'Utilisateur inconnu',
                                email: userDetails?.email || 'N/A',
                                profilePicture: userDetails?.profilePicture || null,
                                totalReports: data.totalReports || 0,
                                violationCount: data.violationCount || 0
                            });
                        }
                    }
                    console.log(`✅ Fallback loaded ${allBlockedAccounts.length} blocked accounts (restrictions object present)`);
                    filteredBlockedAccounts = [...allBlockedAccounts];
                }

    updateStats();
    renderBlockedSummary();
        renderBlockedAccounts();
        
        loadingSpinner.style.display = 'none';
        if (filteredBlockedAccounts.length === 0) {
            emptyState.style.display = 'block';
        } else {
            blockedList.style.display = 'block';
        }
        
    } catch (error) {
        console.error('❌ Error loading blocked accounts:', error);
        loadingSpinner.style.display = 'none';
        emptyState.style.display = 'block';
    }
}

// Apply filters
function applyFilters() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    
    filteredBlockedAccounts = allBlockedAccounts.filter(account => {
        const matchesSearch = searchTerm === '' || 
            account.userId.toLowerCase().includes(searchTerm) ||
            account.username.toLowerCase().includes(searchTerm);
        
        return matchesSearch;
    });
    
    console.log(`🔍 Filtered: ${filteredBlockedAccounts.length} accounts`);
    currentPage = 1;
    updateStats();
    renderBlockedAccounts();
}

// Update statistics
function updateStats() {
    document.getElementById('total-blocked').textContent = allBlockedAccounts.length;
    document.getElementById('filtered-blocked').textContent = filteredBlockedAccounts.length;
    
    const totalPages = Math.ceil(filteredBlockedAccounts.length / itemsPerPage) || 1;
    document.getElementById('current-page-info').textContent = `${currentPage}/${totalPages}`;
}

// Build summary (counts per restriction type like mobile design)
function renderBlockedSummary() {
    const container = document.getElementById('blocked-summary');
    if (!container) return; // only if markup present
    // We interpret specific flags; if field absent we do NOT count it to avoid inflation
    const reportsBlocked = allBlockedAccounts.filter(a => a.restrictions?.canReport === false).length;
    const votesBlocked = allBlockedAccounts.filter(a => a.restrictions?.canVote === false).length;

    // Robust banned detection: try several common field names/structures
    function isBannedRestriction(r) {
        if (!r) return false;
        // 1. Explicit banned flags
        if (r.isBanned === true) return true;
        if (r.banned === true) return true;
        if (typeof r.status === 'string' && r.status.toLowerCase() === 'banned') return true;
        if (r.disabled === true) return true;
        // 2. Banned until (timestamp in future)
        if (r.bannedUntil && typeof r.bannedUntil === 'object') {
            // Firestore Timestamp: {seconds, nanoseconds}
            const now = Date.now() / 1000;
            if (typeof r.bannedUntil.seconds === 'number' && r.bannedUntil.seconds > now) return true;
        }
        // 3. Composite: all posting/comment/reporting disabled
        if (r.canPost === false && r.canComment === false) return true;
        if (r.canPost === false && r.canComment === false && r.canReport === false) return true;
        return false;
    }

    const bannedMatches = allBlockedAccounts.filter(a => isBannedRestriction(a.restrictions));
    const banned = bannedMatches.length;
    // Also count needsModeration (seen in sample restrictions)
    const underModeration = allBlockedAccounts.filter(a => a.restrictions?.reviewPending === true || a.restrictions?.underReview === true || a.restrictions?.needsModeration === true).length;

    console.log('[BlockedSummary] computed counts ->', { reportsBlocked, votesBlocked, banned, underModeration, totalLoaded: allBlockedAccounts.length });
    // Debug details: list which accounts matched banned and a sample of restrictions for inspection
    console.log('[BlockedSummary] bannedMatches IDs:', bannedMatches.map(a => a.userId));
    // Log first 10 restrictions objects to inspect structure
    console.log('[BlockedSummary] sample restrictions (first 10):', allBlockedAccounts.slice(0,10).map(a => ({ id: a.userId, restrictions: a.restrictions })) );
    container.innerHTML = `
        <div class="blocked-stats-row">
            <div class="blocked-stat-card danger">
                <span class="material-icons">gavel</span>
                <div><strong>${banned}</strong> Bannis</div>
            </div>
            <div class="blocked-stat-card warn">
                <span class="material-icons">visibility_off</span>
                <div><strong>${reportsBlocked}</strong> Signalements bloqués</div>
            </div>
            <div class="blocked-stat-card neutral">
                <span class="material-icons">how_to_vote</span>
                <div><strong>${votesBlocked}</strong> Votes bloqués</div>
            </div>
            <div class="blocked-stat-card info">
                <span class="material-icons">visibility</span>
                <div><strong>${underModeration}</strong> En modération</div>
            </div>
        </div>`;
}

// Render blocked accounts
function renderBlockedAccounts() {
    const blockedList = document.getElementById('blocked-list');
    const emptyState = document.getElementById('empty-state');
    
    if (filteredBlockedAccounts.length === 0) {
        blockedList.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageAccounts = filteredBlockedAccounts.slice(startIndex, endIndex);
    
    blockedList.innerHTML = pageAccounts.map(account => `
    <div class="entity-card">
            <div class="account-header">
                <div class="account-avatar">
                    ${account.profilePicture ? `<img src="${account.profilePicture}" alt="${account.username}">` : `<span class='material-icons'>account_circle</span>`}
                </div>
                <div class="account-info">
                    <div class="account-name">${account.username}</div>
                    <div class="account-id" style="margin-top:4px;">
                        <span class="chip blocked"><span class="material-icons" style="font-size:14px;">block</span> Bloqué</span>
                        <span class="chip reputation-${account.reputationScore>=50?'positive':account.reputationScore>=0?'neutral':'negative'}">Rep: ${account.reputationScore}</span>
                    </div>
                </div>
                <div class="account-status chip blocked" style="cursor:default;">Bloqué</div>
            </div>
            <div class="account-details">
                <div class="detail-item"><span class="material-icons">report_problem</span><span>${account.blockReason}</span></div>
                <div class="detail-item"><span class="material-icons">calendar_today</span><span>${formatDate(account.blockedAt)}</span></div>
                <div class="detail-item"><span class="material-icons">flag</span><span>Signalements: ${account.totalReports}</span></div>
                <div class="detail-item"><span class="material-icons">warning</span><span>Violations: ${account.violationCount}</span></div>
                </div>
                <div class="account-actions-row single-action">
                    <button class="action-btn secondary" onclick="openProfileModal('${account.userId}'); event.stopPropagation();"><span class="material-icons">person</span> Profil</button>
                </div>
        </div>`).join('');
    
    emptyState.style.display = 'none';
    blockedList.style.display = 'block';
    
    updatePaginationControls();
}

// ===== Pagination Controls =====
function updatePaginationControls() {
    const totalPages = Math.ceil(filteredBlockedAccounts.length / itemsPerPage) || 1;
    document.getElementById('pagination-info').textContent = `Page ${currentPage} / ${totalPages}`;
    
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        renderBlockedAccounts();
        updateStats();
    }
}

function nextPage() {
    const totalPages = Math.ceil(filteredBlockedAccounts.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderBlockedAccounts();
        updateStats();
    }
}

// Go back to dashboard
function goBack() {
    window.location.href = '../index.html';
}

// Utility: Format date
function formatDate(date) {
    if (!date) return 'N/A';
    if (typeof date === 'string') date = new Date(date);
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Blocked Accounts View initialized');
    loadBlockedAccounts();
});
