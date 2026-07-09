require('dotenv').config();
const { Pool } = require('pg');

// La variable DATABASE_URL contiendra l'URI récupéré sur Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Indispensable pour la connexion sécurisée à Supabase
  }
});

module.exports = {
  /**
   * Équivalent de db.all() pour récupérer plusieurs lignes
   */
  all: (text, params, callback) => {
    pool.query(text, params, (err, res) => {
      if (err) return callback(err, null);
      callback(null, res.rows);
    });
  },

  /**
   * Équivalent de db.get() pour récupérer une seule ligne
   */
  get: (text, params, callback) => {
    pool.query(text, params, (err, res) => {
      if (err) return callback(err, null);
      callback(null, res.rows[0] || null);
    });
  },

  /**
   * Équivalent de db.run() pour les INSERT, UPDATE, DELETE
   */
  run: function (text, params, callback) {
    pool.query(text, params, function (err, res) {
      if (err) return callback(err);
      // On passe l'objet de réponse complet au callback si besoin
      callback(null, res);
    });
  },
  
  pool
};