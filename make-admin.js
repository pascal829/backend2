const db = require('./database');

const email = process.argv[2]; // on passe l'email en argument

if (!email) {
  console.log('Usage: node make-admin.js votre-email@exemple.com');
  process.exit(1);
}

db.run('UPDATE users SET role = ? WHERE email = ?', ['admin', email], function(err) {
  if (err) {
    console.error('Erreur :', err);
  } else if (this.changes === 0) {
    console.log('Aucun utilisateur trouvé avec cet email');
  } else {
    console.log(`✅ ${email} est maintenant administrateur`);
  }
  process.exit(0);
});