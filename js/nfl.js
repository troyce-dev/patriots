// NFL teams for the helmets: name, abbreviation and helmet colors only (no logos).
// shell = helmet color, stripe = stripe/number color, mask = facemask color.
(function (root) {
  'use strict';
  const T = (abbr, name, city, shell, stripe, mask) => ({ abbr, name, city, shell, stripe, mask });
  const NFL_TEAMS = [
    T('ARI', 'Cardinals', 'Arizona', '#ffffff', '#97233f', '#97233f'),
    T('ATL', 'Falcons', 'Atlanta', '#101820', '#a71930', '#101820'),
    T('BAL', 'Ravens', 'Baltimore', '#1a1a1a', '#241773', '#1a1a1a'),
    T('BUF', 'Bills', 'Buffalo', '#ffffff', '#c60c30', '#00338d'),
    T('CAR', 'Panthers', 'Carolina', '#a5acaf', '#0085ca', '#101820'),
    T('CHI', 'Bears', 'Chicago', '#0b162a', '#c83803', '#0b162a'),
    T('CIN', 'Bengals', 'Cincinnati', '#fb4f14', '#101820', '#101820'),
    T('CLE', 'Browns', 'Cleveland', '#ff3c00', '#ffffff', '#ffffff'),
    T('DAL', 'Cowboys', 'Dallas', '#b0b7bc', '#003594', '#869397'),
    T('DEN', 'Broncos', 'Denver', '#002244', '#fb4f14', '#002244'),
    T('DET', 'Lions', 'Detroit', '#b0b7bc', '#0076b6', '#0076b6'),
    T('GB', 'Packers', 'Green Bay', '#ffb612', '#203731', '#203731'),
    T('HOU', 'Texans', 'Houston', '#03202f', '#a71930', '#03202f'),
    T('IND', 'Colts', 'Indianapolis', '#ffffff', '#002c5f', '#a2aaad'),
    T('JAX', 'Jaguars', 'Jacksonville', '#101820', '#006778', '#101820'),
    T('KC', 'Chiefs', 'Kansas City', '#e31837', '#ffffff', '#ffffff'),
    T('LV', 'Raiders', 'Las Vegas', '#a5acaf', '#000000', '#000000'),
    T('LAC', 'Chargers', 'Los Angeles', '#ffffff', '#0080c6', '#0080c6'),
    T('LAR', 'Rams', 'Los Angeles', '#003594', '#ffa300', '#003594'),
    T('MIA', 'Dolphins', 'Miami', '#ffffff', '#008e97', '#008e97'),
    T('MIN', 'Vikings', 'Minnesota', '#4f2683', '#ffc62f', '#4f2683'),
    T('NE', 'Patriots', 'New England', '#b0b7bc', '#c60c30', '#002244'),
    T('NO', 'Saints', 'New Orleans', '#d3bc8d', '#101820', '#101820'),
    T('NYG', 'Giants', 'New York', '#0b2265', '#a71930', '#a5acaf'),
    T('NYJ', 'Jets', 'New York', '#125740', '#ffffff', '#125740'),
    T('PHI', 'Eagles', 'Philadelphia', '#004c54', '#a5acaf', '#101820'),
    T('PIT', 'Steelers', 'Pittsburgh', '#101820', '#ffb612', '#101820'),
    T('SF', '49ers', 'San Francisco', '#b3995d', '#aa0000', '#aa0000'),
    T('SEA', 'Seahawks', 'Seattle', '#002244', '#69be28', '#002244'),
    T('TB', 'Buccaneers', 'Tampa Bay', '#34302b', '#d50a0a', '#34302b'),
    T('TEN', 'Titans', 'Tennessee', '#0c2340', '#4b92db', '#0c2340'),
    T('WAS', 'Commanders', 'Washington', '#5a1414', '#ffb612', '#5a1414'),
  ];
  const byAbbr = (a) => NFL_TEAMS.find((t) => t.abbr === a) || null;
  // the game's team object for an NFL team
  const asTeam = (a) => { const n = byAbbr(a); return n ? { name: n.name, color: n.shell, stripe: n.stripe, mask: n.mask, abbr: n.abbr, nfl: n.abbr } : null; };
  root.FBNFL = { NFL_TEAMS, byAbbr, asTeam, DEFAULT: ['BUF', 'MIA', 'NYJ', 'KC', 'PHI'] };
})(typeof self !== 'undefined' ? self : this);
