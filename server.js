const express = require("express");
const pg = require("pg");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const schema = require("./schema");
//const { Server } = require("socket.io");
const { WebSocketServer } = require("ws");
const { createServer } = require("http");
const Validator = require("jsonschema").Validator;
const v = new Validator();

require("dotenv").config();

var validate = require("express-jsonschema").validate;

const pool = new pg.Pool();

function authUser(req, res, next) {
    // TODO: probably want to return errors in JSON later
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

wss.on("connection", (socket) => {
    console.log("WebSocket connection extablished");
    socket.userid == null;
    socket.groups = [];

    sockets.push(socket);

    socket.on("message", (data, isBinary) => {
        console.log(typeof data);
        console.log(data);
        console.log(isBinary);
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

                            pool.query("SELECT groupID FROM groupMembers WHERE userID=$1::text", [socket.userid], (err, results) => {
                                if (err) {
                                    socket.groups = [];
                                    return;
                                }

                                socket.groups = results.rows;
                            });
                        }
                    });
                    break;

                case "location":
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
                pool.query("INSERT INTO groupMembers (userID,groupID) VALUES ($1::text,$2::text)", [req.user.userid, groupID], (err, results) => {
                    if (err) return next(err);

                    if (results.rowCount == 1) {
                        res.send({
                            status: "success",
                            groupID: groupID
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

        console.log(results.rows);
    });
});

// Get the locations of all the users that share a group with the requestor
app.get("/locations", authUser, (req, res, next) => {
    pool.query("SELECT DISTINCT ON (groupMembers.groupID) groupMembers.groupID,groupMembers.nickname,previousPositions.recordedPoint AS point,previousPositions.dateRecorded AS date,users.userID FROM (SELECT * FROM groupMembers WHERE userID=$1::text) AS groupMembers INNER JOIN previousPositions ON previousPositions.userID=groupMembers.userID INNER JOIN users ON users.userID=groupMembers.userID ORDER BY groupMembers.groupID,date DESC", [req.user.userid], (err, results) => {
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
            console.log(affectedGroups);

            results.rows.forEach((member) => {
                // TODO: Exclude members who have sent a location update recently.
            });

            sockets.forEach((socket) => {
                console.log("Checking socket");
                if (exemptUsers.indexOf(socket.userid) == -1) {
                    userInSuitableGroups = false;

                    socket.groups.forEach((group) => {
                        console.log(group);
                        if (affectedGroups.indexOf(group.groupid) != -1) {
                            userInSuitableGroups = true;
                        }
                    });

                    if (userInSuitableGroups) {
                        console.log("Send request");
                        socket.send(formFullResponse("location_request", {}));
                    }
                }
            });
        });

        
    });
});

httpServer.listen(8080);
//app.listen(8080);