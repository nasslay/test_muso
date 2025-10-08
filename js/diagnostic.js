// Script de test pour vérifier le bon fonctionnement du dashboard
console.log('=== DIAGNOSTIC DASHBOARD MUSO ===');

// 1. Vérifier que Firebase est chargé
if (typeof firebase !== 'undefined') {
    console.log('✅ Firebase SDK chargé');
} else {
    console.error('❌ Firebase SDK non trouvé');
}

// 2. Vérifier que FirebaseServices est configuré
if (typeof FirebaseServices !== 'undefined') {
    console.log('✅ FirebaseServices configuré');
} else {
    console.error('❌ FirebaseServices non trouvé');
}

// 3. Vérifier AdminActionsService
if (typeof AdminActionsService !== 'undefined') {
    console.log('✅ AdminActionsService chargé');
    console.log('Actions disponibles:', Object.keys(AdminActionsService));
} else {
    console.error('❌ AdminActionsService non trouvé');
}

// 4. Vérifier openProfileModal
if (typeof openProfileModal !== 'undefined') {
    console.log('✅ openProfileModal disponible');
} else {
    console.error('❌ openProfileModal non trouvé');
}

console.log('=== FIN DIAGNOSTIC ===');