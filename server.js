const express = require("express");
const pg = require("pg");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");

require("dotenv").config();

const pool = new pg.Pool();

function authUser(req, res, next) {
    // TODO: probably want to return errors in JSON later
    if (typeof req.cookies.key != "string") return res.status(403).send("No auth key provided!");

    var authKey = req.cookies.key;
    pool.query("SELECT userID,studyType,lastSeen,defaultName,userType FROM users where authKey=$1::text", [authKey], (err, results) => {
        if (err) return next(err);

        if (results.rowCount == 0) {
            return res.status(403).send("Authentication key is not valid!");

        } else {
            req.user = results.rows[0];
            next();
        }
    });

}

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get("/", authUser, (req, res) => {
    res.send("User ID: " + req.user.userid);
});

app.post("/creategroup", authUser, (req, res, next) => {
    // TODO: Validate input (perhaps using express-jsonschema)

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

app.listen(8080);