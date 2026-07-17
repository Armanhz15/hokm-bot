CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    coins INTEGER DEFAULT 0,
    created_at BIGINT
);

CREATE TABLE tables (
    id SERIAL PRIMARY KEY,
    code TEXT,
    type TEXT DEFAULT 'public',
    status TEXT DEFAULT 'waiting',
    wager INTEGER DEFAULT 0,
    host_id INTEGER,
    created_at BIGINT
);

CREATE TABLE table_seats (
    id SERIAL PRIMARY KEY,
    table_id INTEGER,
    user_id INTEGER,
    seat INTEGER,
    team INTEGER,
    joined_at BIGINT
);

CREATE TABLE rounds (
    id SERIAL PRIMARY KEY,
    table_id INTEGER,
    round_no INTEGER DEFAULT 1,
    hakem_suit TEXT,
    hakem_seat INTEGER,
    turn_seat INTEGER,
    team0_tricks INTEGER DEFAULT 0,
    team1_tricks INTEGER DEFAULT 0,
    state_json TEXT,
    status TEXT DEFAULT 'active'
);

CREATE TABLE tricks (
    id SERIAL PRIMARY KEY,
    round_id INTEGER,
    trick_no INTEGER,
    lead_suit TEXT,
    plays TEXT,
    winner_seat INTEGER
);

CREATE TABLE queue (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    wager INTEGER DEFAULT 0,
    entered_at BIGINT
);

CREATE TABLE wallet_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    kind TEXT,
    amount INTEGER,
    ref_id TEXT,
    created_at BIGINT
);

CREATE TABLE wagers (
    id SERIAL PRIMARY KEY,
    table_id INTEGER,
    team0_locked INTEGER DEFAULT 0,
    team1_locked INTEGER DEFAULT 0,
    settled INTEGER DEFAULT 0,
    settled_at BIGINT
);

CREATE TABLE game_history (
    id SERIAL PRIMARY KEY,
    table_id INTEGER,
    winner_team INTEGER,
    team0_rounds INTEGER DEFAULT 0,
    team1_rounds INTEGER DEFAULT 0,
    wager INTEGER DEFAULT 0,
    ended_at BIGINT
);

CREATE TABLE leaderboard (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    coins_won INTEGER DEFAULT 0
);
