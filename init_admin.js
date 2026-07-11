const db = require('./database');
const bcrypt = require('bcryptjs');

async function createFirstAdmin() {
  const email = 'pascaltourrrel@gmail.com'; // 👈 Ton adresse de connexion
  const password = 'ccgq2026@Passe';        // 👈 Ton mot de passe robuste
  const name = 'Pascal';

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Requête SQL compatible PostgreSQL (avec la virgule et db.query)
    const sql = `INSERT INTO users (email, password, name, role) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (email) 
                 DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role`;

    // Utilisation de la méthode universelle définie dans ton database.js
    const targetMethod = typeof db.query === 'function' ? db.query.bind(db) : (typeof db.run === 'function' ? db.run.bind(db) : null);

    if (!targetMethod) {
      throw new Error("Impossible de trouver la méthode d'exécution (db.query ou db.run) dans database.js");
    }

    targetMethod(sql, [email, hashedPassword, name, 'admin'], (err) => {
      if (err) {
        console.error("❌ Erreur lors de la création de l'admin :", err.message);
      } else {
        console.log(`\n✅ Compte Admin synchronisé avec succès !`);
        console.log(`📧 Email : ${email}`);
        console.log(`🔑 Mot de passe : ${password}\n`);
      }
      process.exit();
    });

  } catch (err) {
    console.error("❌ Erreur d'exécution :", err.message);
    process.exit();
  }
}

createFirstAdmin();