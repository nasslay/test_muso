// All Users View Logic
let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const itemsPerPage = 20;
let selectedUser = null;
let currentUserTypeFilter = 'all';

// Load all users from Firebase
async function loadAllUsers() {
    console.log('🔍 Loading all users...');
    const loadingSpinner = document.getElementById('loading-spinner');
    const usersList = document.getElementById('users-list');
    const emptyState = document.getElementById('empty-state');
    
    loadingSpinner.style.display = 'block';
    usersList.style.display = 'none';
    emptyState.style.display = 'none';
    
    try {
        const db = firebase.firestore();
        
        // Get all users
        const usersSnapshot = await db.collection('users').get();
        console.log(`✅ Found ${usersSnapshot.size} users`);
        
        // Get user reputation data
        const reputationSnapshot = await db.collection('user_reputation').get();
        const reputationMap = new Map();
        reputationSnapshot.forEach(doc => {
            reputationMap.set(doc.id, doc.data());
        });
        
        allUsers = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const reputation = reputationMap.get(doc.id);
            
            allUsers.push({
                userId: doc.id,
                username: userData.username || 'Utilisateur inconnu',
                email: userData.email || 'N/A',
                profilePicture: userData.profilePicture || null,
                isAdmin: userData.isAdmin || false,
                createdAt: userData.createdAt?.toDate() || new Date(),
                lastLogin: userData.lastLogin?.toDate() || null,
                // Reputation data
                reputationScore: reputation?.reputationScore || 0,
                isBlocked: reputation?.restrictions?.canReport === false || false,
                restrictions: reputation?.restrictions || {},
                totalReports: reputation?.totalReports || 0,
                violationCount: reputation?.violationCount || 0
            });
        });
        
        // Sort by creation date (newest first)
        allUsers.sort((a, b) => b.createdAt - a.createdAt);
        
        console.log(`✅ Loaded ${allUsers.length} users with details`);
        filteredUsers = [...allUsers];
        
        updateStats();
        renderUsers();
        
        loadingSpinner.style.display = 'none';
        if (filteredUsers.length === 0) {
            emptyState.style.display = 'block';
        } else {
            usersList.style.display = 'block';
        }
        
    } catch (error) {
        console.error('❌ Error loading users:', error);
        loadingSpinner.style.display = 'none';
        emptyState.style.display = 'block';
    }
}

// Set user type filter
function setUserTypeFilter(filter) {
    currentUserTypeFilter = filter;
    
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
    
    filteredUsers = allUsers.filter(user => {
        const matchesSearch = searchTerm === '' || 
            user.userId.toLowerCase().includes(searchTerm) ||
            user.username.toLowerCase().includes(searchTerm) ||
            user.email.toLowerCase().includes(searchTerm);
        
        let matchesType = true;
        if (currentUserTypeFilter === 'admin') {
            matchesType = user.isAdmin === true;
        } else if (currentUserTypeFilter === 'regular') {
            matchesType = user.isAdmin === false && user.isBlocked === false;
        } else if (currentUserTypeFilter === 'blocked') {
            matchesType = user.isBlocked === true;
        }
        
        return matchesSearch && matchesType;
    });
    
    console.log(`🔍 Filtered: ${filteredUsers.length} users`);
    currentPage = 1;
    updateStats();
    renderUsers();
}

// Update statistics
function updateStats() {
    document.getElementById('total-users').textContent = allUsers.length;
    document.getElementById('filtered-users').textContent = filteredUsers.length;
    
    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;
    document.getElementById('current-page-info').textContent = `${currentPage}/${totalPages}`;
}

// Render users
function renderUsers() {
    const usersList = document.getElementById('users-list');
    const emptyState = document.getElementById('empty-state');
    
    if (filteredUsers.length === 0) {
        usersList.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageUsers = filteredUsers.slice(startIndex, endIndex);
    
    usersList.innerHTML = pageUsers.map(user => {
        const repClass = user.reputationScore>=50?'reputation-positive':user.reputationScore>=0?'reputation-neutral':'reputation-negative';
        const statusChip = user.isAdmin ? `<span class='chip admin'><span class='material-icons' style='font-size:14px;'>admin_panel_settings</span>Admin</span>` : user.isBlocked ? `<span class='chip blocked'><span class='material-icons' style='font-size:14px;'>block</span>Bloqué</span>` : `<span class='chip reputation-positive' style='border-color:rgba(76,175,80,.4);'><span class='material-icons' style='font-size:14px;'>check_circle</span>Actif</span>`;
        return `
    <div class="entity-card" onclick="openProfileModal('${user.userId}')">
            <div class="account-header">
                <div class="account-avatar">${user.profilePicture?`<img src='${user.profilePicture}' alt='${user.username}'>`:`<span class='material-icons'>account_circle</span>`}</div>
                <div class="account-info">
                    <div class="account-name">${user.username}</div>
                    <div class="account-id" style="margin-top:4px;">
                        ${statusChip}
                        <span class="chip ${repClass}">Rep: ${user.reputationScore}</span>
                    </div>
                </div>
                <div class="account-status chip ${user.isAdmin?'admin':user.isBlocked?'blocked':repClass}" style="cursor:default;">${user.isAdmin?'Admin':user.isBlocked?'Bloqué':'Actif'}</div>
            </div>
            <div class="account-details">
                <div class="detail-item"><span class="material-icons">email</span><span>${user.email}</span></div>
                <div class="detail-item"><span class="material-icons">calendar_today</span><span>${formatDate(user.createdAt)}</span></div>
                <div class="detail-item"><span class="material-icons">star</span><span>Réputation: ${user.reputationScore}</span></div>
                ${user.lastLogin?`<div class="detail-item"><span class="material-icons">login</span><span>${formatDate(user.lastLogin)}</span></div>`:''}
            </div>
            <div class="account-actions-row single-action">
                <button class="action-btn secondary" onclick="openProfileModal('${user.userId}'); event.stopPropagation();"><span class="material-icons">person</span> Profil</button>
            </div>
        </div>`;
    }).join('');
    
    emptyState.style.display = 'none';
    usersList.style.display = 'block';
    
    updatePaginationControls();
}

// ===== Modal Management & Pagination =====
function updatePaginationControls() {
    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;
    document.getElementById('pagination-info').textContent = `Page ${currentPage} / ${totalPages}`;
    
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        renderUsers();
        updateStats();
    }
}

function nextPage() {
    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderUsers();
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
    console.log('🚀 All Users View initialized');
    loadAllUsers();
});
