require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const fetch = require('node-fetch');
const db = require('./database');

const app = express();

// ===== CONFIGURATION DES VARIABLES D'ENVIRONNEMENT =====
const JWT_SECRET = process.env.JWT_SECRET;
const ALERT_EMAIL = process.env.ALERT_EMAIL;
const ALERT_FROM = process.env.ALERT_FROM;

// ===== CONFIGURATION DES CORS =====
// Ajoute ici l'adresse exacte de ton site Vercel une fois qu'il est en ligne
const allowedOrigins = [
  'http://localhost:5173', 
  'http://localhost:3000',
  'https://maintenance-two-nu.vercel.app' // 👈 Remplace par ton vrai lien Vercel
]; 

app.use(cors({
    origin: function (origin, callback) {
        // Autorise les requêtes sans origine (comme Postman ou les mobiles)
        if (!origin) return callback(null, true);
        
        // Vérifie si l'origine est autorisée ou si c'est une preview Vercel
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('vercel.app')) {
            return callback(null, true);
        } else {
            const msg = 'La politique CORS de ce site n\'autorise pas l\'accès depuis l\'origine spécifiée.';
            return callback(new Error(msg), false);
        }
    },
    credentials: true
}));

app.use(express.json());

// ===== FONCTIONS SYSTÈME (EMAIL & UTILS) =====

// Fonction générique d'envoi d'email via Brevo
async function sendEmail(to, toName, subject, htmlContent) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { email: ALERT_FROM, name: 'Maintenance CCGQ' },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(JSON.stringify(error));
  }
  return response.json();
}

function getEmailDestinataire(technicienId) {
  return new Promise((resolve) => {
    if (technicienId) {
      // Remplacement du ? par $1
      db.get('SELECT email, name FROM users WHERE id = $1', [technicienId], (err, user) => {
        resolve(user ? { email: user.email, name: user.name } : { email: ALERT_EMAIL, name: 'Équipe' });
      });
    } else {
      resolve({ email: ALERT_EMAIL, name: 'Équipe' });
    }
  });
}

async function sendMaintenanceAlert(machine, daysLeft) {
  const destinataire = await getEmailDestinataire(machine.technicienId);
  const subject = daysLeft === 0
    ? `🔴 Maintenance URGENTE aujourd'hui — ${machine.name}`
    : `⚠️ Maintenance dans ${daysLeft} jour(s) — ${machine.name}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: ${daysLeft <= 0 ? '#ef4444' : '#f59e0b'}; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">
          ${daysLeft <= 0 ? '🔴 Maintenance urgente' : '⚠️ Rappel de maintenance'}
        </h1>
      </div>
      <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #374151;">
          Bonjour ${destinataire.name},<br><br>
          ${daysLeft <= 0
            ? `La maintenance de <strong>${machine.name}</strong> est prévue <strong>aujourd'hui</strong>.`
            : `La maintenance de <strong>${machine.name}</strong> est prévue dans <strong>${daysLeft} jour(s)</strong>.`
          }
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr style="background: #f9fafb;">
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Machine</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${machine.name}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Type</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${machine.type || '—'}</td>
          </tr>
          <tr style="background: #f9fafb;">
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Emplacement</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${machine.location || '—'}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Date prévue</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${new Date(machine.nextMaintenance).toLocaleDateString('fr-FR')}</td>
          </tr>
        </table>
      </div>
    </div>`;

  try {
    await sendEmail(destinataire.email, destinataire.name, subject, htmlContent);
    console.log(`✅ Email envoyé à ${destinataire.email} pour ${machine.name}`);
  } catch (err) {
    console.error(`❌ Erreur email pour ${machine.name}:`, err.message);
  }
}

async function sendFailureAlert(machine) {
  const destinataire = await getEmailDestinataire(machine.technicienId);
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #ef4444; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">🚨 Machine défaillante !</h1>
      </div>
      <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #374151;">
          Bonjour ${destinataire.name},<br><br>
          La machine <strong>${machine.name}</strong> vient de passer en état <strong>défaillant</strong>.
        </p>
      </div>
    </div>`;

  try {
    await sendEmail(destinataire.email, destinataire.name, `🚨 Machine défaillante — ${machine.name}`, htmlContent);
    console.log(`✅ Alerte défaillance envoyée à ${destinataire.email}`);
  } catch (err) {
    console.error(`❌ Erreur email défaillance:`, err.message);
  }
}

// ===== MIDDLEWARES =====

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non authentifié' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

// ===== ROUTES AUTHENTIFICATION =====

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/auth/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  db.all('SELECT id, email, name, role, createdAt FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });
    res.json(rows);
  });
});

app.delete('/api/auth/users/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  if (req.user.id === parseInt(req.params.id)) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });

  // Remplacement du ? par $1
  db.run('DELETE FROM users WHERE id = $1', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });
    res.json({ message: 'Utilisateur supprimé' });
  });
});

app.get('/api/users', authMiddleware, (req, res) => {
  db.all('SELECT id, name, role FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });
    res.json(rows);
  });
});

app.post('/api/auth/register', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Seul un administrateur peut créer des comptes' });

  const { email, password, name, role } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Tous les champs sont requis' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Remplacement des ? par $1, $2, $3, $4 + RETURNING id
    db.get(
      'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, hashedPassword, name, role || 'technicien'],
      (err, row) => {
        if (err) {
          if (err.message.includes('unique') || err.code === '23505') {
            return res.status(400).json({ error: 'Cet email est déjà utilisé' });
          }
          return res.status(500).json({ error: 'Erreur serveur' });
        }
        res.json({ message: 'Compte créé avec succès', userId: row.id });
      }
    );
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  // Remplacement du ? par $1
  db.get('SELECT * FROM users WHERE email = $1', [email], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  });
});

// ===== ROUTES MACHINES =====

app.get('/api/machines', authMiddleware, (req, res) => {
  const query = `
    SELECT 
      m.*, 
      COALESCE(
        json_agg(
          json_build_object(
            'id', i.id,
            'machineId', i.machineid,
            'date', i.date,
            'type', i.type,
            'technicien', i.technicien,
            'duree', i.duree,
            'description', i.description,
            'resultat', i.resultat
          )
        ) FILTER (WHERE i.id IS NOT NULL), 
        '[]'
      ) AS interventions
    FROM machines m
    LEFT JOIN interventions i ON m.id = i.machineid
    GROUP BY m.id;
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Erreur lors de la récupération des machines:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    res.json(rows);
  });
});

app.post('/api/machines', authMiddleware, (req, res) => {
  const { name, type, location, status, lastMaintenance, nextMaintenance, notes, technicienId } = req.body;

  // Remplacement par $1 à $8 + RETURNING id
  db.get(
    `INSERT INTO machines (name, type, location, status, lastMaintenance, nextMaintenance, incidents, notes, technicienId)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8) RETURNING id`,
    [name, type, location, status, lastMaintenance, nextMaintenance, notes, technicienId || null],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Erreur serveur' });
      res.json({ id: row.id, name, type, location, status, lastMaintenance, nextMaintenance, incidents: 0, notes, technicienId });
    }
  );
});

app.put('/api/machines/:id', authMiddleware, (req, res) => {
  const { name, type, location, status, lastMaintenance, nextMaintenance, incidents, notes, technicienId } = req.body;

  // 1. Vérification de l'ancien état (Changement ? par $1)
  db.get('SELECT * FROM machines WHERE id = $1', [req.params.id], async (err, oldMachine) => {
    if (!err && oldMachine && status === 'défaillant' && oldMachine.status !== 'défaillant') {
      const fullMachine = { ...oldMachine, name, type, location, status, nextMaintenance, technicienId };
      await sendFailureAlert(fullMachine);
    }
  });

  // 2. Mise à jour (Changement des ? par $1 jusqu'à $10)
  db.run(
    `UPDATE machines SET name=$1, type=$2, location=$3, status=$4, lastMaintenance=$5, nextMaintenance=$6, incidents=$7, notes=$8, technicienId=$9
     WHERE id=$10`,
    [name, type, location, status, lastMaintenance, nextMaintenance, incidents, notes, technicienId || null, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Erreur serveur' });
      res.json({ message: 'Machine mise à jour' });
    }
  );
});

app.delete('/api/machines/:id', authMiddleware, (req, res) => {
  // Remplacement du ? par $1
  db.run('DELETE FROM machines WHERE id=$1', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });
    res.json({ message: 'Machine supprimée' });
  });
});

// ===== ROUTES INTERVENTIONS =====

app.get('/api/interventions', authMiddleware, (req, res) => {
  db.all('SELECT * FROM interventions', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erreur serveur' });
    res.json(rows);
  });
});

app.post('/api/interventions', authMiddleware, (req, res) => {
  const { machineId, date, type, technicien, duree, description, resultat } = req.body;

  // Remplacement par $1 à $7 + RETURNING id
  db.get(
    `INSERT INTO interventions (machineId, date, type, technicien, duree, description, resultat)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [machineId, date, type, technicien, duree, description, resultat],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Erreur serveur' });
      res.json({ id: row.id, machineId, date, type, technicien, duree, description, resultat });
    }
  );
});

// ===== CRON JOB (VÉRIFICATION AUTOMATIQUE) =====

cron.schedule('0 8 * * *', () => {
  console.log('🔍 Vérification des maintenances à venir...');
  const today = new Date();

  db.all('SELECT * FROM machines', [], async (err, machines) => {
    if (err) return console.error('Erreur lecture machines:', err);

    for (const machine of machines) {
      if (!machine.nextMaintenance) continue;
      const nextDate = new Date(machine.nextMaintenance);
      const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));

      if (diffDays === 3) await sendMaintenanceAlert(machine, 3);
      if (diffDays === 0) await sendMaintenanceAlert(machine, 0);
    }
  });
});

// ===== DÉMARRAGE DU SERVEUR =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});