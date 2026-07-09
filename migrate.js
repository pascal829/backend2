const db = require('./database');

db.run('ALTER TABLE machines ADD COLUMN technicienId INTEGER', (err) => {
  if (err) console.log('Colonne déjà existante ou erreur:', err.message);
  else console.log('✅ Colonne technicienId ajoutée');
  process.exit(0);
});