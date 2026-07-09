const db = require('./database');
const bcrypt = require('bcryptjs');

async function createFirstAdmin() {
  const email = 'pascaltourrrel@gmail.com'; // 👈 Choisis l'email de ton choix
  const password = 'ccgq2026@Passe'; // 👈 Choisis un mot de passe robuste
  const name = 'Administrateur';

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Version PostgreSQL avec les $1, $2, $3, $4
    db.run(
      'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)',
      [email, hashedPassword, name, 'admin'],
      (err) => {
        if (err) {
          console.error("❌ Erreur lors de la création de l'admin :", err.message);
        } else {
          console.log(`✅ Premier compte Admin créé avec succès ! (${email})`);
        }
        process.exit();
      }
    );
  } catch (err) {
    console.error(err);
    process.exit();
  }
}

createFirstAdmin();