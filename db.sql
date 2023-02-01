CREATE TABLE IF NOT EXISTS users(
    userID CHAR(64) PRIMARY KEY,
    authKey CHAR(64) NOT NULL UNIQUE,
    studyType CHAR(1) NOT NULL DEFAULT 'L',
    lastSeen TIMESTAMP DEFAULT NULL,
    defaultName VARCHAR(32) DEFAULT NULL,
    userType CHAR(1) NOT NULL DEFAULT 'T'
);

CREATE TABLE IF NOT EXISTS groups(
    groupID CHAR(64) PRIMARY KEY,
    groupName VARCHAR(64) NOT NULL,
    groupDescription VARCHAR(10000),
    groupColour CHAR(6) DEFAULT 'ffffff',
    creationDate TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS groupMembers(
    memberID CHAR(64) NOT NULL UNIQUE,
    userID CHAR(64) NOT NULL,
    nickname VARCHAR(32) DEFAULT NULL,
    joinDate TIMESTAMP NOT NULL,
    lastSeen TIMESTAMP DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS previousPositions(
    positionID CHAR(64) PRIMARY KEY,
    userID CHAR(64) NOT NULL,
    dateRecorded TIMESTAMP NOT NULL,
    recordedPoint POINT NOT NULL
);