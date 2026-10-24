const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const DiscordStrategy = require('passport-discord').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const prisma = require('./prisma');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { 
        id: true, 
        username: true, 
        name: true, 
        email: true, 
        role: true,
        walletBalance: true 
      },
    });
    done(null, user || false);
  } catch (err) {
    done(err, null);
  }
});

// ---------------- Local Strategy (email + password) ----------------
passport.use(
  new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
      try {
        const user = await prisma.user.findUnique({
          where: { email: String(email).toLowerCase().trim() },
        });
        if (!user || !user.password) {
          return done(null, false, { message: 'Invalid credentials.' });
        }
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return done(null, false, { message: 'Invalid credentials.' });

        return done(null, {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          walletBalance: user.walletBalance, 
        });
      } catch (err) {
        return done(err);
      }
    }
  )
);

// ---------------- OAuth User Finder ----------------
async function findOrCreateOAuthUser({ providerField, providerId, email, name }) {
  // 1. Nchoufou wach deja mawjoud b ID mte3 Google/Discord
  let user = await prisma.user.findUnique({ where: { [providerField]: providerId } });
  if (user) return user;

  const cleanEmail = String(email).toLowerCase().trim();
  
  // 2. Nchoufou wach mawjoud compte local b nafs el email
  const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });

  if (existing) {
    // 3. Ila mawjoud, nrabtou m3a Google/Discord w nkhalou emailVerified true bch yedkhel
    return prisma.user.update({
      where: { id: existing.id },
      data: { 
          [providerField]: providerId, 
          name: existing.name || name,
          emailVerified: true // 🌟 HEDHA EL SELLAA7 ELLI YFEKK EL MOCHKLA
      },
    });
  }

  // 4. Ila mahouch mawjoud, nsaybou compte jdid
  return prisma.user.create({
    data: {
      [providerField]: providerId,
      email: cleanEmail,
      name,
      emailVerified: true,
    },
  });
}

const isProd = process.env.NODE_ENV === 'production';
function oauthEnv(name) {
  const v = process.env[name];
  if (!v && isProd) {
    console.error(`[FATAL] ${name} manquant dans .env`);
    process.exit(1);
  }
  return v || 'dummy';
}

// ---------------- Google Strategy ----------------
passport.use(
  new GoogleStrategy(
    {
      clientID: oauthEnv('GOOGLE_CLIENT_ID'),
      clientSecret: oauthEnv('GOOGLE_CLIENT_SECRET'),
      callbackURL: '/auth/google/callback',
      state: true,
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] && profile.emails[0].value;
        if (!email) return done(new Error("Ce compte Google n'a pas d'email."), null);

        const verified =
          profile.emails[0].verified === true ||
          (profile._json && profile._json.email_verified === true);
        if (!verified) return done(new Error("L'email de ce compte Google n'est pas vérifié."), null);

        const user = await findOrCreateOAuthUser({
          providerField: 'googleId',
          providerId: profile.id,
          email,
          name: profile.displayName,
        });
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// ---------------- Discord Strategy ----------------
passport.use(
  new DiscordStrategy(
    {
      clientID: oauthEnv('DISCORD_CLIENT_ID'),
      clientSecret: oauthEnv('DISCORD_CLIENT_SECRET'),
      callbackURL: '/auth/discord/callback',
      scope: ['identify', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        if (!profile.email) {
          return done(new Error("Ce compte Discord n'a pas d'email."), null);
        }
        if (profile.verified !== true) {
          return done(new Error("L'email de ce compte Discord n'est pas vérifié."), null);
        }

        const user = await findOrCreateOAuthUser({
          providerField: 'discordId',
          providerId: profile.id,
          email: profile.email,
          name: profile.username,
        });
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);