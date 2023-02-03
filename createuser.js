const crypto = require("crypto");
const pg = require("pg");
const readline = require("readline");
const process = require("process");

require("dotenv").config();

const client = new pg.Client();
client.connect();

var  it = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

it.question("User Type (N|T): ", (userType) => {
    var userType = userType.toUpperCase();
    if (userType == 'N' || userType == 'T') {
        it.question("Study Type (L/G): ", (studyType) => {
            var studyType = studyType.toUpperCase();
            if (studyType == 'L' || studyType == 'G') {
                // Generate userID and auth key
                var userID = crypto.randomBytes(32).toString("hex");
                var authKey = crypto.randomBytes(32).toString("hex");

                client.query("INSERT INTO users (userID,authKey,studyType,userType) VALUES ($1::text,$2::text,$3::text,$4::text)", [userID, authKey, studyType, userType], (err, res) => {
                    if (err) throw err;

                    console.log(userID + "," + authKey);

                    client.end();
                });
            }
        });

    } else {
        console.log("Invalid user type.");
    }
});