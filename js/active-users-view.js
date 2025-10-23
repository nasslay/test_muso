// Active Users View Logic
let allActiveUsers = [];
let filteredActiveUsers = [];
let currentPage = 1;
const itemsPerPage = 20;
let selectedUser = null;
let currentActivityFilter = 'all';

// Load active users from Firebase (last 24 hours)
async function loadActiveUsers() {
    console.log('🔍 Loading active users (last 24h)...');
    const loadingSpinner = document.getElementById('loading-spinner');
    const activeList = document.getElementById('active-list');
    const emptyState = document.getElementById('empty-state');
    
    loadingSpinner.style.display = 'block';
    activeList.style.display = 'none';
    emptyState.style.display = 'none';
    
    try {
        const db = firebase.firestore();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        // Get user actions from last 24 hours
        const actionsSnapshot = await db.collection('user_actions_log')
            .where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(yesterday))
            .get();
        
        console.log(`✅ Found ${actionsSnapshot.size} actions in last 24h`);
        
        // Group actions by userId and count
        const userActivityMap = new Map();
        
        actionsSnapshot.forEach(doc => {
            const data = doc.data();
            const userId = data.userId;
            
            if (!userId) return;
            
            if (!userActivityMap.has(userId)) {
                userActivityMap.set(userId, {
                    userId: userId,
                    actionCount: 0,
                    lastAction: data.timestamp?.toDate() || new Date(),
                    lastActionType: data.actionType || 'unknown',
                    actions: []
                });
            }
            
            const userActivity = userActivityMap.get(userId);
            userActivity.actionCount++;
            userActivity.actions.push({
                type: data.actionType || 'unknown',
                timestamp: data.timestamp?.toDate() || new Date(),
                details: data.details || {}
            });
            
            // Update last action if this is more recent
            if (data.timestamp && data.timestamp.toDate() > userActivity.lastAction) {
                userActivity.lastAction = data.timestamp.toDate();
                userActivity.lastActionType = data.actionType || 'unknown';
            }
        });
        
        console.log(`✅ Found ${userActivityMap.size} unique active users`);
        
        // Fetch user details for each active user
        allActiveUsers = [];
        for (const [userId, activity] of userActivityMap) {
            try {
                const userDoc = await db.collection('users').doc(userId).get();
                let userDetails = {
                    username: 'Utilisateur inconnu',
                    email: 'N/A',
                    profilePicture: null,
                    isAdmin: false
                };
                
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    userDetails = {
                        username: userData.username || 'Utilisateur inconnu',
                        email: userData.email || 'N/A',
                        profilePicture: userData.profilePicture || null,
                        isAdmin: userData.isAdmin || false
                    };
                }
                
                allActiveUsers.push({
                    ...activity,
                    ...userDetails
                });
                
            } catch (error) {
                console.log(`❌ Error fetching user ${userId}:`, error);
                // Add user without details
                allActiveUsers.push({
                    ...activity,
                    username: 'Utilisateur inconnu',
                    email: 'N/A',
                    profilePicture: null,
                    isAdmin: false
                });
            }
        }
        
        // Sort by action count (most active first)
        allActiveUsers.sort((a, b) => b.actionCount - a.actionCount);
        
        console.log(`✅ Loaded ${allActiveUsers.length} active users with details`);
        filteredActiveUsers = [...allActiveUsers];
        
        updateStats();
        renderActiveUsers();
        
        loadingSpinner.style.display = 'none';
        if (filteredActiveUsers.length === 0) {
            emptyState.style.display = 'block';
        } else {
            activeList.style.display = 'block';
        }
        
    } catch (error) {
        console.error('❌ Error loading active users:', error);
        loadingSpinner.style.display = 'none';
        emptyState.style.display = 'block';
    }
}

// Set activity filter
function setActivityFilter(filter) {
    currentActivityFilter = filter;
    
    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.closest('.filter-btn').classList.add('active');
    
    applyFilters();
}

// Apply filters
function applyFilters() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    
    filteredActiveUsers = allActiveUsers.filter(user => {
        const matchesSearch = searchTerm === '' || 
            user.userId.toLowerCase().includes(searchTerm) ||
            user.username.toLowerCase().includes(searchTerm);
        
        let matchesActivity = true;
        if (currentActivityFilter === 'high') {
            matchesActivity = user.actionCount > 10;
        } else if (currentActivityFilter === 'medium') {
            matchesActivity = user.actionCount >= 5 && user.actionCount <= 10;
        } else if (currentActivityFilter === 'low') {
            matchesActivity = user.actionCount < 5;
        }
        
        return matchesSearch && matchesActivity;
    });
    
    console.log(`🔍 Filtered: ${filteredActiveUsers.length} users`);
    currentPage = 1;
    updateStats();
    renderActiveUsers();
}

// Update statistics
function updateStats() {
    document.getElementById('total-active').textContent = allActiveUsers.length;
    document.getElementById('filtered-active').textContent = filteredActiveUsers.length;
    
    const totalPages = Math.ceil(filteredActiveUsers.length / itemsPerPage) || 1;
    document.getElementById('current-page-info').textContent = `${currentPage}/${totalPages}`;
}

// Get activity level color
function getActivityColor(count) {
    if (count > 10) return '#4caf50'; // Green - high activity
    if (count >= 5) return '#ff9800'; // Orange - medium activity
    return '#2196f3'; // Blue - low activity
}

// Get activity level text
function getActivityLevel(count) {
    if (count > 10) return 'Très actif';
    if (count >= 5) return 'Actif';
    return 'Peu actif';
}

// Format action type
function formatActionType(type) {
    const types = {
        'create_post': 'Publication créée',
        'create_comment': 'Commentaire ajouté',
        'create_report': 'Signalement créé',
        'join_event': 'Événement rejoint',
        'send_message': 'Message envoyé',
        'like': 'Like',
        'share': 'Partage',
        'login': 'Connexion',
        'profile_update': 'Profil mis à jour'
    };
    return types[type] || type;
}

// Render active users
function renderActiveUsers() {
    const activeList = document.getElementById('active-list');
    const emptyState = document.getElementById('empty-state');
    
    if (filteredActiveUsers.length === 0) {
        activeList.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageUsers = filteredActiveUsers.slice(startIndex, endIndex);
    
    activeList.innerHTML = pageUsers.map(user => {
        const activityColor = getActivityColor(user.actionCount);
        const activityLevel = getActivityLevel(user.actionCount);
        const activityClass = user.actionCount>10? 'reputation-positive': user.actionCount>=5? 'reputation-neutral':'reputation-negative';
        return `
    <div class="entity-card" onclick="openProfileModal('${user.userId}')">
            <div class="account-header">
                <div class="account-avatar">${user.profilePicture ? `<img src='${user.profilePicture}' alt='${user.username}'>` : `<span class='material-icons'>account_circle</span>`}</div>
                <div class="account-info">
                    <div class="account-name">${user.username}</div>
                    <div class="account-id" style="margin-top:4px;">
                        ${user.isAdmin ? `<span class='chip admin'>Admin</span>`:''}
                        <span class="chip ${activityClass}"><span class='material-icons' style='font-size:14px;'>trending_up</span>${activityLevel}</span>
                        <span class="chip" style="opacity:.85;">${user.actionCount} act.</span>
                    </div>
                </div>
                <div class="account-status chip ${activityClass}" style="cursor:default;">${activityLevel}</div>
            </div>
            <div class="account-details">
                <div class="detail-item"><span class="material-icons">bar_chart</span><span>Actions: <strong>${user.actionCount}</strong></span></div>
                <div class="detail-item"><span class="material-icons">update</span><span>${formatActionType(user.lastActionType)}</span></div>
                <div class="detail-item"><span class="material-icons">schedule</span><span>${formatDate(user.lastAction)}</span></div>
            </div>
        </div>`;
    }).join('');
    
    emptyState.style.display = 'none';
    activeList.style.display = 'block';
    
    updatePaginationControls();
}

// ===== Modal Management & Pagination =====
function updatePaginationControls() {
    const totalPages = Math.ceil(filteredActiveUsers.length / itemsPerPage) || 1;
    document.getElementById('pagination-info').textContent = `Page ${currentPage} / ${totalPages}`;
    
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        renderActiveUsers();
        updateStats();
    }
}

function nextPage() {
    const totalPages = Math.ceil(filteredActiveUsers.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderActiveUsers();
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
    console.log('🚀 Active Users View initialized');
    loadActiveUsers();
});
