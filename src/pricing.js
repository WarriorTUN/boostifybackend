// Calcul du prix CÔTÉ SERVEUR.
// Le client n'envoie que des CHOIX, jamais le prix ni les textes affichés.

const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

const VALORANT = {
  game: 'Valorant',
  ranks: ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'],
  divisions: 3,
  servers: ['EU', 'NA', 'AP', 'BR', 'LATAM'],
  queueKey: 'queue',
  queues: { Competitive: 'Competitive', Unrated: 'Unrated' },
  divisionQueues: ['Competitive'],
  rpRanges: ['0-20', '21-40', '41-60', '61-80', '81-100'],
  serviceLabels: { division: 'Rank Boost', wins: 'Wins Boost', placement: 'Games Boost' },
  placementWord: 'Games',
  centsPerDivision: 1200,
  centsPerWin: 900,
  centsPerGame: 800,
  duoPercent: 135,
  maxWins: 25,
  maxGames: 25,
  fmt: (name, div) => `${name.toUpperCase()} ${div}`,
};

const ROCKET_LEAGUE = {
  game: 'Rocket League',
  ranks: ['Bronze', 'Silver', 'Gold', 'Plat', 'Diamond', 'Champ', 'Grand Champ', 'SSL'],
  divisions: 4,
  servers: ['EU', 'NA', 'SAM', 'OCE', 'ASIA'],
  queueKey: 'playlist',
  queues: { '2v2': 'Doubles (2v2)', '3v3': 'Standard (3v3)', '1v1': 'Duel (1v1)' },
  divisionQueues: null,
  rpRanges: null,
  serviceLabels: { division: 'Rank Boost', wins: 'Wins Boost', placement: 'Placement Boost' },
  placementWord: 'Placement Games',
  centsPerDivision: 500,
  centsPerWin: 350,
  centsPerGame: 300,
  duoPercent: 130,
  maxWins: 25,
  maxGames: 10,
  fmt: (name, div) => `${name.toUpperCase()} Division ${ROMAN[div]}`,
};

function intIn(v, min, max) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function oneOf(v, list) {
  return typeof v === 'string' && list.includes(v) ? v : null;
}

function build(b, cfg) {
  const service = oneOf(b.service, ['division', 'wins', 'placement']);
  if (!service) return { error: 'Type de service invalide.' };

  const playstyle = oneOf(b.playstyle, ['solo', 'duo']);
  if (!playstyle) return { error: 'Mode de jeu invalide (solo/duo).' };

  const server = oneOf(b.server, cfg.servers);
  if (!server) return { error: 'Serveur invalide.' };

  const queueKeys = Object.keys(cfg.queues);
  const queueKey = oneOf(b[cfg.queueKey], queueKeys);
  if (!queueKey) return { error: 'File / playlist invalide.' };
  if (service === 'division' && cfg.divisionQueues && !cfg.divisionQueues.includes(queueKey)) {
    return { error: 'Cette file n\'est pas disponible pour un Rank Boost.' };
  }

  const currRank = oneOf(b.currRank, cfg.ranks);
  const currDiv = intIn(b.currDiv, 1, cfg.divisions);
  if (!currRank || !currDiv) return { error: 'Rang actuel invalide.' };

  let cents;
  let desiredRank;
  let currentLP = 'N/A';

  if (service === 'division') {
    const targetRank = oneOf(b.targetRank, cfg.ranks);
    const targetDiv = intIn(b.targetDiv, 1, cfg.divisions);
    if (!targetRank || !targetDiv) return { error: 'Rang cible invalide.' };

    const total = (name, div) => (cfg.ranks.indexOf(name) + 1) * cfg.divisions + div;
    const diff = total(targetRank, targetDiv) - total(currRank, currDiv);
    if (diff < 1) return { error: 'Le rang cible doit être supérieur au rang actuel.' };

    cents = diff * cfg.centsPerDivision;
    desiredRank = cfg.fmt(targetRank, targetDiv);
    if (cfg.rpRanges) currentLP = oneOf(b.currentRP, cfg.rpRanges) || 'N/A';
  } else if (service === 'wins') {
    const wins = intIn(b.wins, 1, cfg.maxWins);
    if (!wins) return { error: 'Nombre de wins invalide.' };
    cents = wins * cfg.centsPerWin;
    desiredRank = `${wins} Wins`;
  } else {
    const games = intIn(b.placements, 1, cfg.maxGames);
    if (!games) return { error: 'Nombre de games invalide.' };
    cents = games * cfg.centsPerGame;
    desiredRank = `${games} ${cfg.placementWord}`;
  }

  if (playstyle === 'duo') cents = Math.round((cents * cfg.duoPercent) / 100);

  const styleLabel = playstyle === 'duo' ? 'Duo' : 'Solo';

  return {
    game: cfg.game,
    service: `${cfg.serviceLabels[service]} (${styleLabel})`,
    currentRank: cfg.fmt(currRank, currDiv),
    desiredRank,
    currentLP,
    queueType: cfg.queues[queueKey],
    server,
    price: cents / 100,
  };
}

// ---------------- League of Legends ----------------
const LOL_RANKS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster'];
const LOL_DIV_NAME = { 4: 'IV', 3: 'III', 2: 'II', 1: 'I' };
const LOL_SERVERS = ['EUW', 'EUNE', 'NA', 'OCE', 'TR', 'RU'];
const LOL_QUEUES = ['Solo/Duo', 'Flex', '5s'];
const LOL_LP_RANGES = ['0-20', '21-40', '41-60', '61-80', '81-100'];

function lolStepCost(rankIdx, divVal) {
  let base = 35.0;
  if (rankIdx === 1) base = 3.75;
  else if (rankIdx === 2) base = 4.25;
  else if (rankIdx === 3) base = 5.5;
  else if (rankIdx === 4) base = 7.5;
  else if (rankIdx === 5) base = 13.5;
  else if (rankIdx === 6) base = 23.0;

  let factor = 1.0;
  if (divVal === 3) factor = 1.12;
  else if (divVal === 2) factor = 1.26;
  else if (divVal === 1) factor = 1.42;

  return base * factor;
}

function lolPerWin(rankVal) {
  if (rankVal === 2) return 1.8;
  if (rankVal === 3) return 2.4;
  if (rankVal === 4) return 2.9;
  if (rankVal === 5) return 4.0;
  if (rankVal === 6) return 5.5;
  if (rankVal >= 7) return 8.0;
  return 1.4;
}

function lolPerGame(rankVal) {
  if (rankVal === 2) return 1.6;
  if (rankVal === 3) return 2.2;
  if (rankVal === 4) return 3.0;
  if (rankVal === 5) return 3.8;
  if (rankVal === 6) return 4.4;
  if (rankVal >= 7) return 5.0;
  return 1.2;
}

function buildLol(b) {
  const service = oneOf(b.service, ['division', 'wins', 'games']);
  if (!service) return { error: 'Type de service invalide.' };

  const playstyle = oneOf(b.playstyle, ['solo', 'duo']);
  if (!playstyle) return { error: 'Mode de jeu invalide (solo/duo).' };

  const server = oneOf(b.server, LOL_SERVERS);
  if (!server) return { error: 'Serveur invalide.' };

  const queue = oneOf(b.queue, LOL_QUEUES);
  if (!queue) return { error: 'Type de file invalide.' };

  const currRank = oneOf(b.currRank, LOL_RANKS);
  const currDiv = intIn(b.currDiv, 1, 4);
  if (!currRank || !currDiv) return { error: 'Rang actuel invalide.' };

  const currVal = LOL_RANKS.indexOf(currRank) + 1;
  const masterPlus = currVal >= 8;
  const effDiv = masterPlus ? 1 : currDiv;

  let currentRankText;
  let masterCurrLP = null;
  if (masterPlus) {
    masterCurrLP = intIn(b.masterCurrLP, 0, 1000);
    if (masterCurrLP === null) return { error: 'LP actuels invalides.' };
    currentRankText = `${currRank.toUpperCase()} (${masterCurrLP} LP)`;
  } else {
    currentRankText = `${currRank.toUpperCase()} ${LOL_DIV_NAME[currDiv]}`;
  }

  let basePrice;
  let desiredRank;

  if (service === 'division') {
    const targetRank = oneOf(b.targetRank, LOL_RANKS);
    if (!targetRank) return { error: 'Rang cible invalide.' };
    const targetVal = LOL_RANKS.indexOf(targetRank) + 1;

    if (masterPlus) {
      if (targetVal < currVal) return { error: 'Le rang cible doit être supérieur ou égal au rang actuel.' };
      const masterTargetLP = intIn(b.masterTargetLP, 0, Math.max(1000, masterCurrLP + 30));
      if (masterTargetLP === null || masterTargetLP < masterCurrLP + 30) {
        return { error: 'LP cibles invalides (minimum +30 LP).' };
      }
      const diffLP = masterTargetLP - masterCurrLP;
      basePrice = (diffLP / 30) * 22.0;
      desiredRank = `${targetRank.toUpperCase()} (${masterTargetLP} LP)`;
    } else {
      const targetDiv = intIn(b.targetDiv, 1, 4);
      if (!targetDiv) return { error: 'Rang cible invalide.' };

      const pos = (r, d) => r * 4 + (4 - d);
      const steps = pos(targetVal, targetDiv) - pos(currVal, currDiv);
      if (steps < 1) return { error: 'Le rang cible doit être supérieur au rang actuel.' };

      let tempRank = currVal;
      let tempDiv = currDiv;
      let total = 0;
      for (let i = 0; i < steps; i++) {
        total += lolStepCost(tempRank, tempDiv);
        tempDiv--;
        if (tempDiv < 1) {
          tempDiv = 4;
          tempRank++;
        }
      }
      basePrice = total;
      desiredRank = `${targetRank.toUpperCase()} ${LOL_DIV_NAME[targetDiv]}`;
    }
  } else if (service === 'wins') {
    const wins = intIn(b.wins, 1, 20);
    if (!wins) return { error: 'Nombre de wins invalide.' };
    const divMultiplier = (5 - effDiv) * 0.04;
    basePrice = wins * (lolPerWin(currVal) * (1 + divMultiplier));
    desiredRank = `${wins} Wins`;
  } else {
    const games = intIn(b.games, 1, 25);
    if (!games) return { error: 'Nombre de games invalide.' };
    const divMultiplier = (5 - effDiv) * 0.04;
    basePrice = games * (lolPerGame(currVal) * (1 + divMultiplier));
    desiredRank = `${games} Games`;
  }

  if (playstyle === 'duo') basePrice *= 1.35;
  if (b.express === true) basePrice *= 1.2;
  if (b.stream === true) basePrice *= 1.15;

  const price = Number(basePrice.toFixed(2));
  if (!(price > 0)) return { error: 'Commande invalide.' };

  const serviceLabel = { division: 'Division Boost', wins: 'Wins Boost', games: 'Games Boost' }[service];
  const currentLP = masterPlus || service !== 'division' ? 'N/A' : oneOf(b.lpRange, LOL_LP_RANGES) || 'N/A';

  return {
    game: 'League of Legends',
    service: `${serviceLabel} (${playstyle === 'duo' ? 'Duo' : 'Solo'})`,
    currentRank: currentRankText,
    desiredRank,
    currentLP,
    queueType: queue,
    server,
    price,
  };
}

// Retourne { error } ou { game, service, currentRank, desiredRank, currentLP, queueType, server, price }
function buildOrder(body) {
  const b = body && typeof body === 'object' ? body : {};
  const key = String(b.game || '').toLowerCase();
  if (key === 'valorant') return build(b, VALORANT);
  if (key === 'rocketleague') return build(b, ROCKET_LEAGUE);
  if (key === 'lol') return buildLol(b);
  return { error: 'Ce jeu n\'est pas encore disponible à la commande.' };
}

module.exports = { buildOrder };