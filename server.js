const express = require("express");
const pg = require("pg");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const schema = require("./schema");
//const { Server } = require("socket.io");
const { WebSocketServer } = require("ws");
const { createServer } = require("http");
const Validator = require("jsonschema").Validator;
const path = require("path");
const v = new Validator();

require("dotenv").config();

var validate = require("express-jsonschema").validate;

const pool = new pg.Pool();

function authUser(req, res, next) {
    if (typeof req.cookies.key != "string") return res.send({status: "failure", reason: "Login key was not provided!"});

    var authKey = req.cookies.key;
    pool.query("SELECT userID,studyType,lastSeen,defaultName,userType FROM users where authKey=$1::text", [authKey], (err, results) => {
        if (err) return next(err);

        if (results.rowCount == 0) {
            return res.send({status: "failure", reason: "Login key was incorrect!"});

        } else {
            req.user = results.rows[0];
            next();
        }
    });

}

const app = express();
app.use(express.json());
app.use(cookieParser());
const httpServer = createServer(app);

var wss = new WebSocketServer({server: httpServer});

var sockets = [];
var userToSocket = {};

//const io = new Server(httpServer, {});

function formFullResponse(type, body) {
    return JSON.stringify({
        responsible_req: type,
        body: body
    });
}

var requestMap = {
    "auth": schema.sch
}

var inviteCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

function generateRandomStr(length) {
    var randStr = "";

    for (let i=0; i<length; i++) {
        randStr += inviteCharacters.charAt(Math.floor(Math.random() * inviteCharacters.length));
    }

    return randStr;
}

function getGroups(userid, sock) {
    pool.query("SELECT groupID FROM groupMembers WHERE userID=$1::text", [userid], (err, results) => {
        if (err) {
            sock.groups = [];
        }

        sock.groups = results.rows;
    });
}

wss.on("connection", (socket) => {
    console.log("WebSocket connection extablished");
    socket.userid == null;
    socket.groups = [];

    sockets.push(socket);

    socket.on("message", (data, isBinary) => {
        if (isBinary) return;

        console.log(data.toString());

        var request;
        try {
            request = JSON.parse(data.toString());

        } catch {
            return;
        }

        if (v.validate(request, schema.FullRequestSchema).valid) {
            // Only permit the auth type if the socket has not logged in.
            if (socket.userid == null && request.type != "auth") {
                socket.send(formFullResponse(request.type, {status:"failure", reason: "no_auth"}));
                return;
            }

            var body = request.body;
            switch (request.type) {
                case "auth":
                    if (socket.userid != null) {
                        socket.send(formFullResponse("auth", {status: "failure", reason: "auth_already_completed"}));
                        return;
                    }
            
                    pool.query("SELECT userID,studyType,lastSeen,defaultName,userType FROM users where authKey=$1::text", [body.authKey], (err, results) => {
                        if (err) {
                            socket.send(formFullResponse("auth", {status: "error"}));
                            return;
                        }
            
                        if (results.rowCount == 0) {
                            socket.send(formFullResponse("auth", {status: "failure", reason: "bad_key"}));
            
                        } else {
                            socket.userid = results.rows[0].userid;
                            userToSocket[socket.userid] = socket;
                            socket.usertype = results.rows[0].usertype;
                            socket.studytype = results.rows[0].studytype;
                            socket.send(formFullResponse("auth", {status: "success", user: results[0]}));

                            getGroups(socket.userid, socket);
                        }
                    });
                    break;

                case "location":
                    if (body.onCampus != null && body.onCampus != undefined) {
                        if (!body.onCampus) {
                            console.log("Empty location update");
                            break;
                        }
                        if (body.latitude == 0 && body.longitude == 0) {
                            console.log("No GPS fix");
                            break;
                        }
                    }
                    // TODO: Validate body
                    crypto.randomBytes(32, (err, buf) => {
                        if (err) {
                            socket.send(formFullResponse("location", {status: "error"}));
                            return;
                        }

                        var randStr = buf.toString("hex");

                        pool.query("INSERT INTO previousPositions (positionID,userID,recordedPoint) VALUES ($1::text,$2::text,POINT($3,$4))", [randStr, socket.userid, body.latitude, body.longitude]);
                    });

                    break;

                default:
                    console.log("Unknown request type '" + request.type + "'");
                    break;
            }
        }
    });

    socket.on("close", () => {
        console.log("Closing socket");
        socket.close();
    });

});

app.get("/", authUser, (req, res) => {
    res.send({
        status: "success",
        userid: req.user.userid
    });
});

app.post("/creategroup", authUser, validate({body: schema.CreateGroupSchema}), (req, res, next) => {
    crypto.randomBytes(32, (err, buf) => {
        if (err) return next(err);

        var groupID = buf.toString("hex");

        pool.query("INSERT INTO groups (groupID,groupName,groupDescription) VALUES ($1::text,$2::text,$3::text)", [groupID, req.body.name, req.body.desc], (err, results) => {
            if (err) return next(err);

            if (results.rowCount == 1) {
                pool.query("INSERT INTO groupMembers (userID,groupID,nickname) VALUES ($1::text,$2::text,$3::text)", [req.user.userid, groupID, "Owner"], (err, results) => {
                    if (err) return next(err);

                    if (results.rowCount == 1) {
                        res.send({
                            status: "success",
                            groupID: groupID
                        });

                        sockets.forEach((sock) => {
                            if (sock.userid == req.user.userid) {
                                getGroups(req.user.userid, sock);
                            }
                        });

                    } else {
                        res.send({
                            status: "failure",
                            desc: "Failed to insert member into the group"
                        });
                    }
                });

            } else {
                res.send({
                    status: "failure",
                    desc: "Failed to insert group into database"
                });
            }
        });
    });

});

app.get("/groups", authUser, (req, res, next) => {
    pool.query("SELECT * FROM groups INNER JOIN groupMembers ON groupMembers.userID=$1::text AND groups.groupID=groupMembers.groupID", [req.user.userid], (err, results) => {
        if (err) return next(err);
        
        res.send({
            status: "success",
            groups: results.rows
        });
    });
});

// Get group information and member list (will want to include location for each later)
app.get("/groups/:groupID", authUser, (req, res, next) => {
    pool.query("SELECT * FROM groups WHERE groupID=$1::text", [req.params.groupID], (err, results1) => {
        if (err) return next(err);

        if (results1.rowCount == 0) {
            return res.send({
                status: "failure",
                desc: "Requested group does not exist"
            });
        }

        pool.query("SELECT * FROM groupMembers WHERE groupID=$1::text", [req.params.groupID], (err, results2) => {
            if (err) return next(err);

            var members = results2.rows;
            
            // TODO: Check if the requesting user is in the group in a better way
            var authorised = false;

            members.forEach((value) => {
                if (value.userid == req.user.userid) {
                    authorised = true;
                }
            });

            if (!authorised) {
                return res.send({
                    status: "failure",
                    desc: "Access is denied"
                });
            }

            res.send({
                status: "success",
                info: results1.rows,
                members: members
            });
        });

    });
});

app.get("/groups/:groupID/locations", authUser, (req, res, next) => {
    // TODO: Make this work for more than a single group, the goal is to show the locations of people no matter what group they're in (as long as the requester is a member of that group)

    pool.query("SELECT users.userID,groupMembers.nickname,recordedPoint FROM users INNER JOIN groupMembers ON users.userID=groupMembers.userID AND groupMembers.groupID=$1::text INNER JOIN previousPositions ON users.userID=previousPositions.userID", [req.params.groupID], (err, results) => {
        if (err) return next(err);

        sockets.forEach((sock) => {
            sock.send(formFullResponse("location_request", {}));
        });

        res.send({
            status: "success",
            members: results.rows
        });

    });
});

// Get the locations of all the users that share a group with the requestor
app.get("/locations", authUser, (req, res, next) => {
    pool.query("WITH usersGroups AS (SELECT groupID FROM groupMembers WHERE userID=$1::text), commonUsers AS (SELECT groupMembers.userID FROM groupMembers INNER JOIN usersGroups ON usersGroups.groupID=groupMembers.groupID WHERE groupMembers.userID!=$2::text GROUP BY groupMembers.userID), newestPositions AS (SELECT previousPositions.userID,MAX(dateRecorded) AS date FROM previousPositions INNER JOIN commonUsers ON previousPositions.userID=commonUsers.userID GROUP BY previousPositions.userID) SELECT previousPositions.userID,recordedPoint AS point,date FROM previousPositions INNER JOIN newestPositions ON previousPositions.userID=newestPositions.userID AND previousPositions.dateRecorded=newestPositions.date;", [req.user.userid, req.user.userid], (err, results) => {
        if (err) return next(err);

        res.send({
            status: "success",
            members: results.rows
        });

        // List of users that have sent a location update within a suitable time period
        var exemptUsers = [];
        
        // List of groups to notify
        var affectedGroups;

        pool.query("SELECT groupID FROM groupMembers WHERE userID=$1::text", [req.user.userid], (err, results2) => {
            if (err) return next(err);

            affectedGroups = results2.rows.map((elem) => elem.groupid);

            results.rows.forEach((member) => {
                // TODO: Exclude members who have sent a location update recently.
            });

            sockets.forEach((socket) => {
                if (exemptUsers.indexOf(socket.userid) == -1) {
                    userInSuitableGroups = false;

                    socket.groups.forEach((group) => {
                        if (affectedGroups.indexOf(group.groupid) != -1) {
                            userInSuitableGroups = true;
                        }
                    });

                    if (userInSuitableGroups) {
                        // Don't send request to the user who requested the locations
                        if (socket.userid == req.user.userid) return;
                        socket.send(formFullResponse("location_request", {}));
                    }
                }
            });
        });

        
    });
});

app.get("/versioninfo", (req, res, next) => {
    res.sendFile(path.join(__dirname, "versioninfo.json"));
});

app.get("/version.zip", (req, res, next) => {
    res.sendFile(path.join(__dirname, "version.zip"));
});

app.post("/joingroup/:inviteID", authUser, validate({body: schema.JoinGroupSchema}), (req, res, next) => {
    pool.query("SELECT * FROM groupInvites WHERE inviteID=$1::text", [req.params.inviteID], (err, results) => {
        if (err) return next(err);

        if (results.rowCount == 0) {
            return res.send({
                status: "failure",
                desc: "Invite does not exist"
            });
        }

        var nickname = req.body.nickname != undefined ? req.body.nickname : "User" + (Math.random() * 1000);

        pool.query("INSERT INTO groupMembers (userID,groupID,nickname) VALUES ($1::text,$2::text,$3::text)", [req.user.userid, results.rows[0].groupid,nickname], (err, results) => {
            if (err) {
                return res.send({
                    status: "failure",
                    desc: "User is already a member or that group does not exist"
                });
            }
    
            res.send({
                status: "success"
            });

            sockets.forEach((sock) => {
                if (sock.userid == req.user.userid) {
                    getGroups(req.user.userid, sock);
                }
            });
        });

    });
});

app.post("/createinvite/:groupID", authUser, (req, res, next) => {
    var inviteID = generateRandomStr(6);

    pool.query("INSERT INTO groupInvites (inviteID,groupID) VALUES ($1::text,$2::text)", [inviteID, req.params.groupID], (err, results) => {
        if (err) {
            console.log(err);
            return res.send({
                status: "failure",
                desc: "Group invite requested for doesn't exist"
            });
        }

        res.send({
            status: "success",
            inviteID: inviteID
        });
    });
});

app.get("/leavegroup/:groupID", authUser, (req, res, next) => {
    pool.query("DELETE FROM groupMembers WHERE userID=$1::text AND groupID=$2::text", [req.user.userid, req.params.groupID], (err, results) => {
        if (err) return next(err);

        res.send({
            status: "success"
        });
    });
});

//setInterval(() => {
//    sockets.forEach((socket) => {
//        socket.send(formFullResponse("location_request", {}));
//    });
//}, 15000);

httpServer.listen(8080);
//app.listen(8080);