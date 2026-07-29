DROP TABLE IF EXISTS impressions_log;
DROP TABLE IF EXISTS clicks_log;
DROP TABLE IF EXISTS campaigns;
DROP TABLE IF EXISTS users;
DROP TYPE IF EXISTS user_role;

CREATE TYPE user_role AS ENUM ('advertiser', 'operator');

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    logo VARCHAR(16) NOT NULL DEFAULT 'owl',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE campaigns (
    id SERIAL PRIMARY KEY,
    advertiser_id INT REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    total_budget NUMERIC(12, 2) NOT NULL,
    max_cpm NUMERIC(10, 2) NOT NULL,
    target_categories TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    target_age_min      INT     NOT NULL DEFAULT 13,    
    target_age_max      INT     NOT NULL DEFAULT 80,
    target_genders      TEXT[]  NOT NULL DEFAULT '{male,female,nonbinary}',
    target_income_min   INT     NOT NULL DEFAULT 1,         
    target_income_max   INT     NOT NULL DEFAULT 10,
    target_household_min INT    NOT NULL DEFAULT 1,        
    target_household_max INT    NOT NULL DEFAULT 10,
    target_locations    TEXT[]  NOT NULL DEFAULT '{}',    
    target_languages    TEXT[]  NOT NULL DEFAULT '{}', 
    target_interests    TEXT[]  NOT NULL DEFAULT '{}', 
    want_risk_taker     BOOLEAN,
    want_relaxed        BOOLEAN,
    want_open_new       BOOLEAN,
    target_shopper      VARCHAR(16) NOT NULL DEFAULT 'any',  
    target_price_min    INT     NOT NULL DEFAULT 1,          
    target_price_max    INT     NOT NULL DEFAULT 10,
    target_media        TEXT[]  NOT NULL DEFAULT '{}',
    target_fields       JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(advertiser_id, status);
CREATE TABLE IF NOT EXISTS impressions_log (
    id          SERIAL PRIMARY KEY,
    campaign_id INT REFERENCES campaigns(id) ON DELETE SET NULL,
    cost        NUMERIC(10,6) NOT NULL,
    category    TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_impressions_campaign ON impressions_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_impressions_created  ON impressions_log(created_at);
CREATE TABLE IF NOT EXISTS clicks_log (
    id          SERIAL PRIMARY KEY,
    campaign_id INT REFERENCES campaigns(id) ON DELETE SET NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clicks_campaign ON clicks_log(campaign_id);

-- For databases created before the logo column existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo VARCHAR(16) NOT NULL DEFAULT 'owl';


INSERT INTO users (email, password_hash, role) VALUES
('operator@flashcast.com', 'dummy_hash_for_now', 'operator');