CREATE TABLE IF NOT EXISTS apikeys (
    apikey VARCHAR(255) PRIMARY KEY,
    keyname VARCHAR(255) NOT NULL,
    accountName VARCHAR(255) NOT NULL,
    UNIQUE(keyname, accountName),
    FOREIGN KEY(accountName) REFERENCES accounts(accountName) ON DELETE CASCADE
);