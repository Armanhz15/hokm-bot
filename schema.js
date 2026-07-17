function defineTable(name) { return { _name: name }; }

const users = defineTable('users');
const tables = defineTable('tables');
const tableSeats = defineTable('table_seats');
const rounds = defineTable('rounds');
const tricks = defineTable('tricks');
const queue = defineTable('queue');
const walletTransactions = defineTable('wallet_transactions');
const wagers = defineTable('wagers');
const gameHistory = defineTable('game_history');
const leaderboard = defineTable('leaderboard');

module.exports = {
  users, tables, tableSeats, rounds, tricks,
  queue, walletTransactions, wagers, gameHistory, leaderboard,
};
