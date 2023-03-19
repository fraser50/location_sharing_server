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
    creationDate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS groupMembers(
    /*memberID CHAR(64) NOT NULL UNIQUE, Don't think there is any point in giving a user a unique ID in every group */
    userID CHAR(64) NOT NULL REFERENCES users(userID),
    groupID CHAR(64) NOT NULL REFERENCES groups(groupID),
    nickname VARCHAR(32) DEFAULT NULL,
    joinDate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lastSeen TIMESTAMP DEFAULT NULL,
    PRIMARY KEY (userID,groupID)
);

CREATE TABLE IF NOT EXISTS previousPositions(
    positionID CHAR(64) PRIMARY KEY,
    userID CHAR(64) NOT NULL REFERENCES users(userID),
    dateRecorded TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    recordedPoint POINT NOT NULL
);

CREATE TABLE IF NOT EXISTS groupInvites(
    inviteID CHAR(12) PRIMARY KEY,
    groupID CHAR(644) NOT NULL REFERENCES groups(groupID),
    dateCreated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);