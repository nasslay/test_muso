// Initialisation et vérification des services
window.MUSO = window.MUSO || {};

// Flag pour savoir si les services sont prêts
window.MUSO.servicesReady = false;

// File d'attente pour les actions en attente
window.MUSO.pendingActions = [];

// Fonction pour exécuter une action quand les services sont prêts
window.MUSO.executeWhenReady = function(action) {
  if (window.MUSO.servicesReady) {
    action();
  } else {
    window.MUSO.pendingActions.push(action);
  }
};

// Vérification périodique des services
function checkServices() {
  const hasFirebase = typeof firebase !== 'undefined';
  const hasFirebaseServices = typeof window.FirebaseServices !== 'undefined';
  const hasAdminActions = typeof window.AdminActionsService !== 'undefined';
  const hasProfileModal = typeof window.openProfileModal !== 'undefined';
  
  console.log('🔍 Checking services:', {
    firebase: hasFirebase,
    firebaseServices: hasFirebaseServices,
    adminActions: hasAdminActions,
    profileModal: hasProfileModal
  });
  
  // Consider core services (firebase + FirebaseServices) ready for most modules
  // Some optional services (AdminActionsService, profile modal) may load later.
  if (hasFirebase && hasFirebaseServices) {
    window.MUSO.servicesReady = true;
    console.log('✅ Core services ready (firebase + FirebaseServices) - continuing initialization');
    
    // Exécuter les actions en attente
    window.MUSO.pendingActions.forEach(action => {
      try {
        action();
      } catch (e) {
        console.error('❌ Error executing pending action:', e);
      }
    });
    window.MUSO.pendingActions = [];
    
    return true;
  }
  
  return false;
}

// Vérifier toutes les 100ms jusqu'à ce que tout soit prêt
const checkInterval = setInterval(() => {
  if (checkServices()) {
    clearInterval(checkInterval);
  }
}, 100);

// Timeout de sécurité
setTimeout(() => {
  if (!window.MUSO.servicesReady) {
    console.error('❌ Services not ready after 10 seconds');
    clearInterval(checkInterval);
  }
}, 10000);

console.log('🚀 MUSO Services initialization started');

window.addEventListener('DOMContentLoaded', () => {
  // Empêcher ouverture automatique de profil au login
  if(window.disableAutoProfileModal) window.disableAutoProfileModal();
  // Fermer tout modal profil injecté par une précédente session restée en mémoire (hot reload)
  if(window.closeAllProfileModals) window.closeAllProfileModals();
  // Initialiser la modération Phase 1 quand les services sont prêts
  window.MUSO.executeWhenReady(()=>{
    try{
      if(window.Phase1Moderation && typeof window.Phase1Moderation.initialize === 'function'){
        window.Phase1Moderation.initialize();
      }
    }catch(e){ console.warn('Erreur initialisation Phase1Moderation', e); }
  });
});