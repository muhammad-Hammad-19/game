// ctx: { stats (lifetime, after this match), match (this match's numbers), result, level, earned, flags }
export const ACHIEVEMENTS = [
  { id: 'first_win', title: 'Off the mark', text: 'Win your first match.', coins: 100, test: c => c.stats.wins >= 1 },
  { id: 'first_six', title: 'Into the stands', text: 'Hit a six.', coins: 50, test: c => c.stats.sixes >= 1 },
  { id: 'six_streak', title: 'Clean striker', text: 'Hit three sixes in a row.', coins: 150, test: c => c.match.bestSixStreak >= 3 },
  { id: 'fifty', title: 'Raise the bat', text: 'Score 50 with one batter.', coins: 150, test: c => c.stats.fifties + c.stats.hundreds >= 1 },
  { id: 'century', title: 'Three figures', text: 'Score 100 with one batter.', coins: 400, test: c => c.stats.hundreds >= 1 },
  { id: 'first_wicket', title: 'Breakthrough', text: 'Take a wicket with your own bowling.', coins: 50, test: c => c.stats.wickets >= 1 },
  { id: 'three_for', title: 'On a roll', text: 'Take 3 wickets in one match.', coins: 150, test: c => c.match.wickets >= 3 },
  { id: 'hat_trick', title: 'Hat-trick hero', text: 'Take three wickets in three balls.', coins: 400, test: c => c.stats.hatTricks >= 1 },
  { id: 'maiden', title: 'Nothing to hit', text: 'Bowl a maiden over.', coins: 150, test: c => c.stats.maidens >= 1 },
  { id: 'chase', title: 'Ice in the veins', text: 'Win a match batting second.', coins: 120, test: c => c.stats.chasesWon >= 1 },
  { id: 'defend', title: 'Hold the line', text: 'Win a match bowling second.', coins: 120, test: c => c.stats.defencesWon >= 1 },
  { id: 'last_ball', title: 'Photo finish', text: 'Win off the final ball.', coins: 250, test: c => c.result === 'win' && c.flags.lastBall },
  { id: 'super_over', title: 'Nerves of steel', text: 'Win a super over.', coins: 250, test: c => c.stats.superOverWins >= 1 },
  { id: 'hard_win', title: 'No easy runs', text: 'Beat a Hard opponent.', coins: 200, test: c => c.result === 'win' && c.flags.difficulty === 'Hard' },
  { id: 'cup', title: 'Silverware', text: 'Win the Champions Cup.', coins: 500, test: c => c.stats.cups >= 1 },
  { id: 'league', title: 'Top of the table', text: 'Win a career league season.', coins: 600, test: c => c.stats.leagues >= 1 },
  { id: 'online', title: 'Beat a human', text: 'Win an online match.', coins: 200, test: c => c.stats.onlineWins >= 1 },
  { id: 'ten_wins', title: 'Winning habit', text: 'Win 10 matches.', coins: 300, test: c => c.stats.wins >= 10 },
  { id: 'runs_500', title: 'Run machine', text: 'Score 500 career runs.', coins: 300, test: c => c.stats.runs >= 500 },
  { id: 'wickets_25', title: 'Strike bowler', text: 'Take 25 career wickets.', coins: 300, test: c => c.stats.wickets >= 25 },
  { id: 'level_5', title: 'Seasoned pro', text: 'Reach level 5.', coins: 250, test: c => c.level >= 5 },
  { id: 'level_10', title: 'Club legend', text: 'Reach level 10.', coins: 600, test: c => c.level >= 10 },
]

// Returns the achievements newly earned in this context.
export function newlyEarned(unlocked, context) {
  return ACHIEVEMENTS.filter(item => !unlocked[item.id] && item.test(context))
}
