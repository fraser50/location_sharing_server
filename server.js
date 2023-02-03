const express = require("express");
const pg = require("pg");
const cookieParser = require("cookie-parser");

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
app.use(cookieParser());

app.get("/", authUser, (req, res) => {
    res.send("User ID: " + req.user.userid);
});

app.listen(8080);